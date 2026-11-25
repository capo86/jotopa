begin;
-- All editable template fields are reusable across guests; they must not
-- accidentally embed a personal bearer credential in another invitation.
create or replace function private.validate_message_template()
returns trigger language plpgsql set search_path='' as $$
declare remaining text;
begin
  new.name:=btrim(new.name);new.updated_at:=clock_timestamp();
  remaining:=regexp_replace(new.body,'\{(nombre|link|fecha|lugar|fecha_limite)\}','','g');
  if remaining ~ '[{}]' or new.body !~ '\{link\}' or concat_ws(' ',new.name,new.body,new.location_label) ~ '[a-fA-F0-9]{64}' or char_length(new.body)>2000 or (select count(*) from regexp_matches(new.body,'\{[^{}]+\}','g'))>20 then raise exception 'invalid_template' using errcode='22023';end if;
  return new;
end;
$$;

-- Bind retries to their original guest, actor, action, template and reference.
create or replace function public.manual_invitation_action(p_event_id uuid,p_guest_id uuid,p_action text,p_request_id uuid,p_template_id uuid default null,p_reference_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare guest_row public.guests; event_row public.events; invitation_row public.invitations; previous public.invitation_events;
  target_channel public.invitation_channel; event_type text; details jsonb:='{}'; payload jsonb; previous_guest uuid;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  select * into guest_row from public.guests where id=p_guest_id and event_id=p_event_id for update;
  if guest_row.id is null then raise exception 'guest_unavailable' using errcode='22023';end if;
  if p_request_id is null or p_action is null or p_action not in ('send','shared','skip','failed','retry','undo','copy_message','copy_link') then raise exception 'invalid_invitation_action' using errcode='22023';end if;
  if p_action<>'undo' and not(p_action='failed' and p_reference_id is not null) then perform private.invitation_sendable(guest_row,event_row);end if;
  select * into previous from public.invitation_events where event_id=p_event_id and request_id=p_request_id;
  if found then
    select guest_id into previous_guest from public.invitations where id=previous.invitation_id;
    if previous_guest<>p_guest_id or previous.meta->>'action' is distinct from p_action or previous.actor_id is distinct from auth.uid() or previous.meta->>'template_id' is distinct from p_template_id::text or previous.meta->>'reference_id' is distinct from p_reference_id::text then raise exception 'invitation_request_conflict' using errcode='22023';end if;
    if p_action in ('send','shared') and not exists(select 1 from public.invitations where id=previous.invitation_id and manual_request_id=p_request_id and sent_at is not null) then raise exception 'stale_invitation_action' using errcode='22023';end if;
    if p_action in ('send','copy_message','copy_link') then payload:=private.invitation_message_payload(guest_row,event_row,p_template_id);end if;
    return jsonb_build_object('action',p_action,'request_id',p_request_id,'replayed',true,'payload',payload);
  end if;
  -- Same lock order as existing management RPCs; profile serializes this actor
  -- across events before enforcing the hourly cap. No actual provider delivery.
  perform 1 from public.profiles where user_id=auth.uid() for update;
  if (select count(*) from public.invitation_events where actor_id=auth.uid() and occurred_at>clock_timestamp()-interval '1 hour' and request_id is not null)>=200 then raise exception 'invitation_action_limit' using errcode='P0001';end if;
  target_channel:=case when p_action in ('shared','copy_message','copy_link') then 'link'::public.invitation_channel else 'whatsapp'::public.invitation_channel end;
  if p_action in ('undo','failed') and p_reference_id is not null then
    select * into invitation_row from public.invitations where event_id=p_event_id and guest_id=p_guest_id and manual_request_id=p_reference_id for update;
    if invitation_row.id is null or invitation_row.sent_at<clock_timestamp()-interval '10 minutes' then raise exception 'stale_invitation_action' using errcode='22023';end if;
  else
    insert into public.invitations(event_id,guest_id,channel) values(p_event_id,p_guest_id,target_channel) on conflict(event_id,guest_id,channel) do nothing;
    select * into invitation_row from public.invitations where event_id=p_event_id and guest_id=p_guest_id and channel=target_channel for update;
  end if;
  if p_action='undo' and p_reference_id is null then raise exception 'stale_invitation_action' using errcode='22023';end if;
  if p_action in ('send','shared') then
    if guest_row.rsvp_status<>'pending' or exists(select 1 from public.invitations where guest_id=p_guest_id and (open_count>0 or sent_at is not null)) then raise exception 'invitation_already_engaged' using errcode='22023';end if;
    if p_action='send' and (guest_row.phone is null or not public.is_valid_guest_phone(guest_row.phone)) then raise exception 'invitation_invalid_phone' using errcode='22023';end if;
    if (select count(*) from public.invitation_events h join public.invitations i on i.id=h.invitation_id where i.guest_id=p_guest_id and h.type='sent' and h.occurred_at>clock_timestamp()-interval '1 hour')>=5 then raise exception 'invitation_guest_limit' using errcode='P0001';end if;
    payload:=private.invitation_message_payload(guest_row,event_row,p_template_id);
    update public.invitations set sent_at=clock_timestamp(),sent_marked_by=auth.uid(),manual_request_id=p_request_id,status='sent',queue_state='done',template_id=p_template_id,error=null,updated_at=clock_timestamp() where id=invitation_row.id;
    event_type:='sent';
  elsif p_action in ('undo','failed') and p_reference_id is not null then
    update public.invitations set sent_at=null,sent_marked_by=null,manual_request_id=null,status=case when p_action='undo' then 'draft'::public.invitation_status else 'failed'::public.invitation_status end,queue_state=case when p_action='undo' then 'pending' else 'failed' end,error=case when p_action='failed' then 'not_sent' else null end,updated_at=clock_timestamp() where id=invitation_row.id;
    event_type:=case when p_action='undo' then 'sent_undone' else 'failed' end;
  elsif p_action in ('skip','failed','retry') then
    if exists(select 1 from public.invitations where guest_id=p_guest_id and sent_at is not null) then raise exception 'stale_invitation_action' using errcode='22023';end if;
    update public.invitations set queue_state=case p_action when 'skip' then 'skipped' when 'failed' then 'failed' else 'pending' end,status=case when p_action='failed' then 'failed'::public.invitation_status else 'draft'::public.invitation_status end,error=case when p_action='failed' then 'not_sent' else null end,updated_at=clock_timestamp() where id=invitation_row.id;
    event_type:=case p_action when 'skip' then 'skipped' when 'failed' then 'failed' else 'resumed' end;
  else
    payload:=private.invitation_message_payload(guest_row,event_row,p_template_id);
    event_type:=case when p_action='copy_message' then 'copy_requested' else 'link_copy_requested' end;
  end if;
  details:=jsonb_build_object('action',p_action,'channel',invitation_row.channel);
  if p_reference_id is not null then details:=details||jsonb_build_object('reference_id',p_reference_id);end if;
  if p_template_id is not null then details:=details||jsonb_build_object('template_id',p_template_id);end if;
  insert into public.invitation_events(invitation_id,event_id,type,request_id,actor_id,meta) values(invitation_row.id,p_event_id,event_type,p_request_id,auth.uid(),details);
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'invitation.'||event_type,p_guest_id,jsonb_build_object('channel',invitation_row.channel));
  perform private.sync_guest_invitation(p_guest_id);
  return jsonb_build_object('action',p_action,'request_id',p_request_id,'replayed',false,'payload',payload);
end;
$$;


commit;

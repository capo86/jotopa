begin;
alter table public.invitations add column delivery_confirmed_at timestamptz;
alter table public.invitation_events drop constraint invitation_events_type_check;
alter table public.invitation_events add constraint invitation_events_type_check check(type in ('sent','sent_undone','opened','rsvp','skipped','failed','resumed','copy_requested','link_copy_requested','delivery_corrected','reminder_sent'));

create function public.confirm_manual_invitation_sent(p_event_id uuid,p_guest_id uuid,p_request_id uuid,p_template_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.manual_invitation_action(p_event_id,p_guest_id,'send',p_request_id,p_template_id);
  update public.invitations set delivery_confirmed_at=coalesce(delivery_confirmed_at,clock_timestamp())
  where event_id=p_event_id and guest_id=p_guest_id and channel='whatsapp' and manual_request_id=p_request_id;
  return result;
end;
$$;

create function public.list_delivery_review(p_event_id uuid,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'invalid_filters' using errcode='22023';end if;
  with eligible as materialized(
    select g.id as guest_id,g.full_name,w.sent_at,w.delivery_confirmed_at
    from public.guests g join public.invitations w on w.guest_id=g.id and w.channel='whatsapp'
    join public.invitations l on l.guest_id=g.id and l.channel='link'
    where g.event_id=p_event_id and g.rsvp_status='pending' and w.sent_at is not null and l.open_count=0 and w.open_count=0
  ), paged as(select * from eligible order by sent_at desc,guest_id limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.correct_manual_delivery(p_event_id uuid,p_guest_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare g public.guests;w public.invitations;l public.invitations;
begin
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  if p_request_id is null then raise exception 'invalid_invitation_action' using errcode='22023';end if;
  select * into g from public.guests where id=p_guest_id and event_id=p_event_id for update;
  select * into w from public.invitations where guest_id=p_guest_id and channel='whatsapp' for update;
  select * into l from public.invitations where guest_id=p_guest_id and channel='link' for update;
  if g.id is null or g.rsvp_status<>'pending' or w.sent_at is null or w.open_count>0 or l.open_count>0 then raise exception 'stale_invitation_action' using errcode='22023';end if;
  update public.invitations set sent_at=null,sent_marked_by=null,manual_request_id=null,delivery_confirmed_at=null,status='failed',queue_state='failed',error='not_sent',updated_at=clock_timestamp() where id=w.id;
  if l.sent_at is null then update public.invitations set queue_state='failed',updated_at=clock_timestamp() where id=l.id;end if;
  perform private.sync_guest_invitation(p_guest_id);
  insert into public.invitation_events(invitation_id,event_id,type,request_id,actor_id,meta) values(w.id,p_event_id,'delivery_corrected',p_request_id,auth.uid(),jsonb_build_object('previous_sent_at',w.sent_at,'previous_confirmed_at',w.delivery_confirmed_at));
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'invitation.delivery_corrected',p_guest_id,jsonb_build_object('previous_sent_at',w.sent_at));
end;
$$;

create function public.list_rsvp_followup_candidates(p_event_id uuid,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;ev public.events;available boolean;
begin
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'invalid_filters' using errcode='22023';end if;
  select * into ev from public.events where id=p_event_id;
  available:=ev.status='active' and ev.deleted_at is null and clock_timestamp()>=ev.session_opens_at and clock_timestamp()<ev.session_closes_at and (ev.rsvp_deadline is null or clock_timestamp()<ev.rsvp_deadline);
  with eligible as materialized(
    select g.id as guest_id,g.full_name,g.party_size,g.phone,case when g.phone is null then 'missing' when public.is_valid_guest_phone(g.phone) then 'valid' else 'invalid' end as phone_state
    from public.guests g join public.invitations l on l.guest_id=g.id and l.channel='link'
    where g.event_id=p_event_id and available and g.rsvp_status='pending' and g.contact_consent and not g.opted_out
      and (l.open_count>0 or exists(select 1 from public.invitations w where w.guest_id=g.id and w.channel='whatsapp' and w.delivery_confirmed_at is not null))
      and not exists(select 1 from public.invitation_events h where h.invitation_id=l.id and h.type='reminder_sent')
  ),paged as(select * from eligible order by lower(full_name),guest_id limit 25 offset p_page*25)
  select jsonb_build_object('available',available,'total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'deadline',coalesce(ev.rsvp_deadline,ev.session_closes_at),'timezone',ev.timezone) into result;
  return result;
end;
$$;

create function public.prepare_rsvp_followup(p_event_id uuid,p_guest_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.guests;ev public.events;l public.invitations;
begin
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  select * into ev from public.events where id=p_event_id;
  select * into g from public.guests where id=p_guest_id and event_id=p_event_id;
  select * into l from public.invitations where guest_id=p_guest_id and channel='link';
  if g.id is null then raise exception 'guest_unavailable' using errcode='22023';end if;
  perform private.invitation_sendable(g,ev);
  if g.rsvp_status<>'pending' or not(l.open_count>0 or exists(select 1 from public.invitations w where w.guest_id=g.id and w.channel='whatsapp' and w.delivery_confirmed_at is not null)) or exists(select 1 from public.invitation_events h where h.invitation_id=l.id and h.type='reminder_sent') then raise exception 'stale_invitation_action' using errcode='22023';end if;
  return jsonb_build_object('guest_id',g.id,'full_name',g.full_name,'phone',g.phone,'party_size',g.party_size,'token',g.invite_token,'deadline',coalesce(ev.rsvp_deadline,ev.session_closes_at),'timezone',ev.timezone);
end;
$$;

create function public.record_rsvp_followup(p_event_id uuid,p_guest_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare g public.guests;ev public.events;l public.invitations;
begin
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  if p_request_id is null then raise exception 'invalid_invitation_action' using errcode='22023';end if;
  select * into ev from public.events where id=p_event_id for update;
  select * into g from public.guests where id=p_guest_id and event_id=p_event_id for update;
  select * into l from public.invitations where guest_id=p_guest_id and channel='link' for update;
  if exists(select 1 from public.invitation_events where event_id=p_event_id and request_id=p_request_id and invitation_id=l.id and type='reminder_sent' and actor_id=auth.uid()) then return;end if;
  if g.id is null then raise exception 'guest_unavailable' using errcode='22023';end if;
  perform private.invitation_sendable(g,ev);
  if g.rsvp_status<>'pending' or not(l.open_count>0 or exists(select 1 from public.invitations w where w.guest_id=g.id and w.channel='whatsapp' and w.delivery_confirmed_at is not null)) or exists(select 1 from public.invitation_events h where h.invitation_id=l.id and h.type='reminder_sent') then raise exception 'stale_invitation_action' using errcode='22023';end if;
  insert into public.invitation_events(invitation_id,event_id,type,request_id,actor_id,meta) values(l.id,p_event_id,'reminder_sent',p_request_id,auth.uid(),jsonb_build_object('channel','whatsapp','manual',true));
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'invitation.reminder_sent',p_guest_id,'{}'::jsonb);
end;
$$;

create function public.dashboard_guest_drilldown(p_event_id uuid,p_metric text,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_event_permission(p_event_id,'dashboard.read') or not public.has_event_permission(p_event_id,'guests.read') then raise exception 'forbidden' using errcode='42501';end if;
  if p_metric not in ('invitations','authorized_people','confirmed_invitations','confirmed_people','declined_invitations','pending_invitations','assigned_people') or p_page is null or p_page<0 or p_page>100000 then raise exception 'invalid_filters' using errcode='22023';end if;
  with eligible as materialized(
    select g.id,g.full_name,g.party_size,g.attending_count,g.rsvp_status,t.name as table_name,l.open_count
    from public.guests g left join public.event_tables t on t.id=g.table_id left join public.invitations l on l.guest_id=g.id and l.channel='link'
    where g.event_id=p_event_id and (
      p_metric in ('invitations','authorized_people') or
      (p_metric in ('confirmed_invitations','confirmed_people') and g.rsvp_status='yes') or
      (p_metric='declined_invitations' and g.rsvp_status='no') or
      (p_metric='pending_invitations' and g.rsvp_status='pending') or
      (p_metric='assigned_people' and g.rsvp_status='yes' and g.table_id is not null))
  ),paged as(select * from eligible order by lower(full_name),id limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.export_final_seating(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare unanswered integer;unassigned integer;confirmed integer;
begin
  if not public.has_event_permission(p_event_id,'guests.read') or not public.has_event_permission(p_event_id,'tables.read') then raise exception 'forbidden' using errcode='42501';end if;
  select count(*) filter(where rsvp_status='pending'),count(*) filter(where rsvp_status='yes' and table_id is null),count(*) filter(where rsvp_status='yes') into unanswered,unassigned,confirmed from public.guests where event_id=p_event_id;
  if unanswered>0 or unassigned>0 or confirmed=0 then raise exception 'seating_not_final' using errcode='22023';end if;
  if confirmed>10000 then raise exception 'export_limit' using errcode='22023';end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('name',g.full_name,'attending_count',g.attending_count,'table',t.name,'group',g.group_label) order by lower(t.name),lower(g.full_name)),'[]'::jsonb)
    from public.guests g join public.event_tables t on t.id=g.table_id where g.event_id=p_event_id and g.rsvp_status='yes');
end;
$$;
revoke all on function public.confirm_manual_invitation_sent(uuid,uuid,uuid,uuid),public.list_delivery_review(uuid,integer),public.correct_manual_delivery(uuid,uuid,uuid),public.list_rsvp_followup_candidates(uuid,integer),public.prepare_rsvp_followup(uuid,uuid),public.record_rsvp_followup(uuid,uuid,uuid),public.dashboard_guest_drilldown(uuid,text,integer),public.export_final_seating(uuid) from public,anon,authenticated;
grant execute on function public.confirm_manual_invitation_sent(uuid,uuid,uuid,uuid),public.list_delivery_review(uuid,integer),public.correct_manual_delivery(uuid,uuid,uuid),public.list_rsvp_followup_candidates(uuid,integer),public.prepare_rsvp_followup(uuid,uuid),public.record_rsvp_followup(uuid,uuid,uuid),public.dashboard_guest_drilldown(uuid,text,integer),public.export_final_seating(uuid) to authenticated;
commit;
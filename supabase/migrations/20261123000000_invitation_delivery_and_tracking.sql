begin;

create type public.invitation_channel as enum ('whatsapp','email','link');
create type public.invitation_status as enum ('draft','queued','sent','delivered','opened','responded','bounced','failed');
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 2 and 80),
  channel public.invitation_channel not null default 'whatsapp' check(channel in ('whatsapp','link')),
  subject text,
  body text not null check(char_length(body) between 1 and 2000),
  location_label text not null default '' check(char_length(location_label)<=240),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,event_id)
);
create index message_templates_event_idx on public.message_templates(event_id,created_at) where archived_at is null;
create unique index guests_id_event_key on public.guests(id,event_id);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null,
  channel public.invitation_channel not null,
  status public.invitation_status not null default 'draft',
  queue_state text not null default 'pending' check(queue_state in ('pending','skipped','failed','done')),
  template_id uuid,
  sent_at timestamptz,
  sent_marked_by uuid references auth.users(id) on delete set null,
  manual_request_id uuid,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0 check(open_count>=0),
  provider_message_id text,
  error text check(error in ('not_sent','popup_blocked','popup_closed','clipboard_unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(guest_id,event_id) references public.guests(id,event_id) on delete cascade,
  foreign key(template_id,event_id) references public.message_templates(id,event_id),
  unique(event_id,guest_id,channel),unique(id,event_id),
  check(delivered_at is null or channel='email'),
  check((open_count=0 and first_opened_at is null and last_opened_at is null) or (open_count>0 and first_opened_at is not null and last_opened_at>=first_opened_at))
);
create index invitations_guest_idx on public.invitations(guest_id);
create index invitations_event_status_idx on public.invitations(event_id,status);
create index invitations_event_queue_idx on public.invitations(event_id,queue_state);
create index invitations_template_idx on public.invitations(template_id);
create index invitations_marked_by_idx on public.invitations(sent_marked_by);
create table public.invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  type text not null check(type in ('sent','sent_undone','opened','rsvp','skipped','failed','resumed','copy_requested','link_copy_requested')),
  request_id uuid,
  visit_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  meta jsonb not null default '{}' check(jsonb_typeof(meta)='object'),
  created_at timestamptz not null default now(),
  foreign key(invitation_id,event_id) references public.invitations(id,event_id) on delete cascade
);
create index invitation_events_invitation_time_idx on public.invitation_events(invitation_id,occurred_at desc,id);
create index invitation_events_event_time_idx on public.invitation_events(event_id,occurred_at desc);
create index invitation_events_actor_time_idx on public.invitation_events(actor_id,occurred_at desc);
create unique index invitation_events_request_key on public.invitation_events(event_id,request_id) where request_id is not null;
create unique index invitation_events_visit_key on public.invitation_events(invitation_id,visit_id) where type='opened';
create unique index invitation_events_rsvp_version_key on public.invitation_events(invitation_id,(meta->>'version')) where type='rsvp';

alter table public.message_templates enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_events enable row level security;
revoke all on public.message_templates,public.invitations,public.invitation_events from public,anon,authenticated;
grant select on public.message_templates,public.invitations to authenticated;
grant select(id,invitation_id,event_id,type,actor_id,occurred_at,meta,created_at) on public.invitation_events to authenticated;
create policy message_templates_read on public.message_templates for select to authenticated using(public.has_event_permission(event_id,'invitations.send') and public.has_event_permission(event_id,'guests.contact_read'));
create policy invitations_read on public.invitations for select to authenticated using(public.has_event_permission(event_id,'guests.read') and public.has_event_permission(event_id,'guests.contact_read'));
create policy invitation_events_read on public.invitation_events for select to authenticated using(public.has_event_permission(event_id,'guests.read') and public.has_event_permission(event_id,'guests.contact_read'));

create function private.validate_message_template()
returns trigger language plpgsql set search_path='' as $$
declare remaining text;
begin
  new.name:=btrim(new.name);new.updated_at:=clock_timestamp();
  remaining:=regexp_replace(new.body,'\{(nombre|link|fecha|lugar|fecha_limite)\}','','g');
  if remaining ~ '[{}]' or new.body !~ '\{link\}' or new.body ~ '[a-fA-F0-9]{64}' or char_length(new.body)>2000 or (select count(*) from regexp_matches(new.body,'\{[^{}]+\}','g'))>20 then raise exception 'invalid_template' using errcode='22023';end if;
  return new;
end;
$$;
create trigger message_template_validate before insert or update on public.message_templates for each row execute function private.validate_message_template();
create function private.seed_invitation_template()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.message_templates(event_id,name,body) values(new.id,'Una invitación especial',E'Hola {nombre} 🌿\n\nQueremos compartir un momento especial con vos.\n📅 {fecha}\n📍 {lugar}\n\nTu invitación personal: {link}\nRespondé antes del {fecha_limite}.\n\n¡Nos va a encantar encontrarnos!');
  return new;
end;
$$;
create trigger events_seed_invitation_template after insert on public.events for each row execute function private.seed_invitation_template();
insert into public.message_templates(event_id,name,body) select id,'Una invitación especial',E'Hola {nombre} 🌿\n\nQueremos compartir un momento especial con vos.\n📅 {fecha}\n📍 {lugar}\n\nTu invitación personal: {link}\nRespondé antes del {fecha_limite}.\n\n¡Nos va a encantar encontrarnos!' from public.events where deleted_at is null;

create function private.sync_guest_invitation(p_guest_id uuid)
returns void language plpgsql set search_path='' as $$
begin
  update public.invitations i set status=case
    when g.rsvp_status<>'pending' then 'responded'::public.invitation_status
    when i.open_count>0 then 'opened'::public.invitation_status
    when exists(select 1 from public.invitations s where s.guest_id=g.id and s.sent_at is not null) then 'sent'::public.invitation_status
    else 'draft'::public.invitation_status end,updated_at=clock_timestamp()
  from public.guests g where i.guest_id=g.id and g.id=p_guest_id and i.channel='link';
end;
$$;
create function private.track_guest_rsvp()
returns trigger language plpgsql security definer set search_path='' as $$
declare invitation_uuid uuid;
begin
  if tg_op='INSERT' then
    insert into public.invitations(event_id,guest_id,channel) values(new.event_id,new.id,'link') returning id into invitation_uuid;
  elsif new.rsvp_version<>old.rsvp_version then
    select id into invitation_uuid from public.invitations where guest_id=new.id and channel='link';
  else return new;end if;
  if new.rsvp_status<>'pending' then
    insert into public.invitation_events(invitation_id,event_id,type,actor_id,occurred_at,meta) values(invitation_uuid,new.event_id,'rsvp',auth.uid(),new.rsvp_at,jsonb_build_object('response',new.rsvp_status,'companions',new.companions_confirmed,'version',new.rsvp_version));
    perform private.sync_guest_invitation(new.id);
  end if;
  return new;
end;
$$;
create trigger guests_track_invitation after insert or update on public.guests for each row execute function private.track_guest_rsvp();
insert into public.invitations(event_id,guest_id,channel,status) select event_id,id,'link',case when rsvp_status<>'pending' then 'responded'::public.invitation_status else 'draft'::public.invitation_status end from public.guests;
insert into public.invitation_events(invitation_id,event_id,type,occurred_at,meta)
select i.id,i.event_id,'rsvp',g.rsvp_at,jsonb_build_object('response',g.rsvp_status,'companions',g.companions_confirmed,'version',g.rsvp_version,'historical',true)
from public.invitations i join public.guests g on g.id=i.guest_id where i.channel='link' and g.rsvp_at is not null and g.rsvp_status<>'pending';

create function private.record_invitation_open(p_guest_id uuid,p_visit_id uuid)
returns void language plpgsql set search_path='' as $$
declare row_value public.invitations; checked_at timestamptz:=clock_timestamp();
begin
  -- Caller has already locked event -> guest and validated the personal token,
  -- active state, access window and public read quota. No public helper grant.
  select * into row_value from public.invitations where guest_id=p_guest_id and channel='link' for update;
  if row_value.id is null or exists(select 1 from public.invitation_events where invitation_id=row_value.id and visit_id=p_visit_id and type='opened') or (row_value.last_opened_at is not null and row_value.last_opened_at>checked_at-interval '60 seconds') then return;end if;
  insert into public.invitation_events(invitation_id,event_id,type,visit_id,occurred_at,meta) values(row_value.id,row_value.event_id,'opened',p_visit_id,checked_at,'{"source":"personal_link"}');
  update public.invitations set first_opened_at=coalesce(first_opened_at,checked_at),last_opened_at=checked_at,open_count=open_count+1,updated_at=checked_at where id=row_value.id;
  perform private.sync_guest_invitation(p_guest_id);
end;
$$;

create function public.save_message_template(p_event_id uuid,p_name text,p_body text,p_location_label text default '',p_template_id uuid default null,p_channel public.invitation_channel default 'whatsapp')
returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 or p_body is null or char_length(p_body) not between 1 and 2000 or p_location_label is null or char_length(p_location_label)>240 or p_channel not in ('whatsapp','link') then raise exception 'invalid_template' using errcode='22023';end if;
  if p_template_id is null then
    if (select count(*) from public.message_templates where event_id=p_event_id and archived_at is null)>=25 then raise exception 'template_limit' using errcode='22023';end if;
    insert into public.message_templates(event_id,name,body,location_label,channel) values(p_event_id,p_name,p_body,p_location_label,p_channel) returning id into saved_id;
  else
    update public.message_templates set name=p_name,body=p_body,location_label=p_location_label,channel=p_channel where id=p_template_id and event_id=p_event_id and archived_at is null returning id into saved_id;
    if saved_id is null then raise exception 'template_unavailable' using errcode='22023';end if;
  end if;
  insert into public.audit_log(event_id,actor_id,action,target) values(p_event_id,auth.uid(),'template.saved',saved_id);
  return saved_id;
end;
$$;
create function public.archive_message_template(p_event_id uuid,p_template_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  update public.message_templates set archived_at=clock_timestamp() where id=p_template_id and event_id=p_event_id and archived_at is null;
  if not found then raise exception 'template_unavailable' using errcode='22023';end if;
  insert into public.audit_log(event_id,actor_id,action,target) values(p_event_id,auth.uid(),'template.archived',p_template_id);
end;
$$;

create function private.invitation_message_payload(p_guest public.guests,p_event public.events,p_template_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare template_row public.message_templates;
begin
  select * into template_row from public.message_templates where id=p_template_id and event_id=p_event.id and archived_at is null;
  if template_row.id is null then raise exception 'template_unavailable' using errcode='22023';end if;
  return jsonb_build_object('guest_id',p_guest.id,'full_name',p_guest.full_name,'phone',p_guest.phone,'token',p_guest.invite_token,'body',template_row.body,'location_label',template_row.location_label,
    'starts_at',p_event.starts_at,'timezone',p_event.timezone,'rsvp_deadline',coalesce(p_event.rsvp_deadline,p_event.session_closes_at));
end;
$$;
create function private.invitation_sendable(p_guest public.guests,p_event public.events)
returns void language plpgsql set search_path='' as $$
begin
  if p_guest.opted_out or not p_guest.contact_consent then raise exception 'contact_not_authorized' using errcode='42501';end if;
  if p_event.status<>'active' or p_event.deleted_at is not null or clock_timestamp()<p_event.session_opens_at or clock_timestamp()>=p_event.session_closes_at or (p_event.rsvp_deadline is not null and clock_timestamp()>=p_event.rsvp_deadline) then raise exception 'sending_closed' using errcode='22023';end if;
end;
$$;
create function public.prepare_invitation_message(p_event_id uuid,p_guest_id uuid,p_template_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare guest_row public.guests; event_row public.events;
begin
  select * into event_row from public.events where id=p_event_id for share;
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  select * into guest_row from public.guests where id=p_guest_id and event_id=p_event_id for share;
  if guest_row.id is null then raise exception 'guest_unavailable' using errcode='22023';end if;
  perform private.invitation_sendable(guest_row,event_row);
  return private.invitation_message_payload(guest_row,event_row,p_template_id);
end;
$$;

create function public.manual_invitation_action(p_event_id uuid,p_guest_id uuid,p_action text,p_request_id uuid,p_template_id uuid default null,p_reference_id uuid default null)
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
    if previous_guest<>p_guest_id or previous.meta->>'action' is distinct from p_action or previous.actor_id is distinct from auth.uid() then raise exception 'invitation_request_conflict' using errcode='22023';end if;
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

create function public.list_invitation_queue(p_event_id uuid,p_bucket text default 'pending',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare event_row public.events; result jsonb; available boolean;
begin
  if not public.has_event_permission(p_event_id,'invitations.send') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  if p_bucket is null or p_bucket not in ('pending','skipped','failed') or p_page is null or p_page<0 or p_page>100000 then raise exception 'invalid_filters' using errcode='22023';end if;
  select * into event_row from public.events where id=p_event_id;
  available:=event_row.status='active' and clock_timestamp()>=event_row.session_opens_at and clock_timestamp()<event_row.session_closes_at and (event_row.rsvp_deadline is null or clock_timestamp()<event_row.rsvp_deadline);
  with eligible as materialized (
    select g.id as guest_id,g.full_name,g.phone,case when g.phone is null then 'missing' when public.is_valid_guest_phone(g.phone) then 'valid' else 'invalid' end as phone_state,coalesce(w.queue_state,'pending') as queue_state
    from public.guests g join public.invitations l on l.guest_id=g.id and l.channel='link' left join public.invitations w on w.guest_id=g.id and w.channel='whatsapp'
    where g.event_id=p_event_id and available and g.contact_consent and not g.opted_out and g.rsvp_status='pending' and l.open_count=0 and l.sent_at is null and w.sent_at is null
      and coalesce(w.queue_state,'pending')=p_bucket
  ), paged as(select * from eligible order by lower(full_name),guest_id limit 25 offset p_page*25)
  select jsonb_build_object('available',available,'total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb)) into result;
  return result;
end;
$$;
create function public.get_guest_invitation_tracking(p_event_id uuid,p_guest_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.has_event_permission(p_event_id,'guests.read') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  if p_guest_ids is null or cardinality(p_guest_ids)>25 then raise exception 'invalid_filters' using errcode='22023';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('guest_id',guest_id,'status',case status when 'draft' then 'pending' else status::text end,'open_count',open_count,'first_opened_at',first_opened_at,'last_opened_at',last_opened_at)) from public.invitations where event_id=p_event_id and guest_id=any(p_guest_ids) and channel='link'),'[]'::jsonb);
end;
$$;
create function public.get_guest_invitation_history(p_event_id uuid,p_guest_id uuid,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_event_permission(p_event_id,'guests.read') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501';end if;
  if not exists(select 1 from public.guests where id=p_guest_id and event_id=p_event_id) then raise exception 'guest_unavailable' using errcode='22023';end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'invalid_filters' using errcode='22023';end if;
  with history as materialized(select h.id,h.type,h.occurred_at,h.actor_id,h.meta,i.channel from public.invitation_events h join public.invitations i on i.id=h.invitation_id where i.guest_id=p_guest_id and i.event_id=p_event_id),
  paged as(select * from history order by occurred_at desc,id desc limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from history),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb)) into result;
  return result;
end;
$$;

revoke all on function private.validate_message_template(),private.seed_invitation_template(),private.sync_guest_invitation(uuid),private.track_guest_rsvp(),private.record_invitation_open(uuid,uuid),private.invitation_message_payload(public.guests,public.events,uuid),private.invitation_sendable(public.guests,public.events),public.save_message_template(uuid,text,text,text,uuid,public.invitation_channel),public.archive_message_template(uuid,uuid),public.prepare_invitation_message(uuid,uuid,uuid),public.manual_invitation_action(uuid,uuid,text,uuid,uuid,uuid),public.list_invitation_queue(uuid,text,integer),public.get_guest_invitation_tracking(uuid,uuid[]),public.get_guest_invitation_history(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_message_template(uuid,text,text,text,uuid,public.invitation_channel),public.archive_message_template(uuid,uuid),public.prepare_invitation_message(uuid,uuid,uuid),public.manual_invitation_action(uuid,uuid,text,uuid,uuid,uuid),public.list_invitation_queue(uuid,text,integer),public.get_guest_invitation_tracking(uuid,uuid[]),public.get_guest_invitation_history(uuid,uuid,integer) to authenticated;
commit;

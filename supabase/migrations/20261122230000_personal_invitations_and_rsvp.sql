begin;

-- Tokens are server-issued bearer credentials, never included in table grants,
-- list/export RPCs, audit metadata or the public invitation projection.
alter table public.guests alter column invite_token set default encode(extensions.gen_random_bytes(32),'hex');
update public.guests set invite_token=encode(extensions.gen_random_bytes(32),'hex') where invite_token is null;
alter table public.guests alter column invite_token set not null;
alter table public.guests add column rsvp_version integer not null default 0 check (rsvp_version>=0);
grant select (rsvp_status,rsvp_at,companions_confirmed,opted_out,rsvp_version) on public.guests to authenticated;

create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.invitation_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','read','write')),
  bucket text not null,
  guest_id uuid references public.guests(id) on delete cascade,
  used integer not null check (used>0),
  window_start timestamptz not null,
  created_at timestamptz not null default now(),
  unique(scope,bucket)
);
create index invitation_rate_guest_idx on private.invitation_rate_limits(guest_id);
create index invitation_rate_window_idx on private.invitation_rate_limits(window_start);
alter table private.invitation_rate_limits enable row level security;
revoke all on private.invitation_rate_limits from public,anon,authenticated;

-- Private helper. A saturated counter is capped; arbitrary invalid tokens only
-- use one of 64 fixed buckets, so they cannot create unbounded state.
create function private.take_invitation_limit(p_scope text,p_bucket text,p_guest_id uuid,p_limit integer)
returns jsonb language plpgsql set search_path='' as $$
declare started timestamptz; count_value integer; checked_at timestamptz:=clock_timestamp();
begin
  insert into private.invitation_rate_limits(scope,bucket,guest_id,used,window_start)
    values(p_scope,p_bucket,p_guest_id,1,checked_at)
  on conflict(scope,bucket) do update set
    used=case when invitation_rate_limits.window_start<=checked_at-interval '1 minute' then 1 else least(invitation_rate_limits.used+1,p_limit+1) end,
    window_start=case when invitation_rate_limits.window_start<=checked_at-interval '1 minute' then checked_at else invitation_rate_limits.window_start end
  returning used,window_start into count_value,started;
  return jsonb_build_object('allowed',count_value<=p_limit,'retry_after',greatest(1,ceil(extract(epoch from started+interval '1 minute'-clock_timestamp()))::integer));
end;
$$;

create function private.invitation_snapshot(p_guest public.guests,p_event public.events)
returns jsonb language sql volatile set search_path='' as $$
  select jsonb_build_object('ok',true,'server_time',clock_timestamp(),
    'event',jsonb_build_object('title',p_event.title,'type',p_event.type,'starts_at',p_event.starts_at,'timezone',p_event.timezone,'rsvp_deadline',p_event.rsvp_deadline,'session_closes_at',p_event.session_closes_at),
    'guest',jsonb_build_object('full_name',p_guest.full_name,'companions_allowed',p_guest.companions_allowed,'companions_confirmed',p_guest.companions_confirmed,'rsvp_status',p_guest.rsvp_status,'rsvp_at',p_guest.rsvp_at,'opted_out',p_guest.opted_out,'version',p_guest.rsvp_version),
    'can_respond',p_event.rsvp_deadline is null or clock_timestamp()<p_event.rsvp_deadline);
$$;

-- POST only. All public failures are returned (not raised), so rate counter
-- increments COMMIT even for invalid tokens, invalid input and stale replies.
create function public.guest_invitation(p_token text,p_request jsonb default '{"action":"read"}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare guest_row public.guests; event_row public.events; guest_uuid uuid; event_uuid uuid;
  gate jsonb; action_name text; response_name text; companion_count integer; expected_version integer; checked_at timestamptz;
begin
  perform set_config('response.headers','[{"Cache-Control":"no-store"},{"Referrer-Policy":"no-referrer"}]',true);
  if coalesce(current_setting('request.method',true),'POST') not in ('','POST') then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  -- Opportunistic, bounded cleanup; SKIP LOCKED avoids waiting on active limits.
  if pg_try_advisory_xact_lock(57281002) then
    delete from private.invitation_rate_limits where id in (select id from private.invitation_rate_limits where window_start<clock_timestamp()-interval '2 minutes' order by window_start,id limit 1000 for update skip locked);
  end if;
  gate:=private.take_invitation_limit('global',(get_byte(extensions.digest(left(coalesce(p_token,''),128),'sha256'),0)%64)::text,null,120);
  if not (gate->>'allowed')::boolean then return jsonb_build_object('ok',false,'code','rate_limited','retry_after',gate->'retry_after'); end if;
  if p_token is null or octet_length(p_token)<>64 or p_token !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','invitation_unavailable'); end if;
  select id,event_id into guest_uuid,event_uuid from public.guests where invite_token=p_token;
  if guest_uuid is null then return jsonb_build_object('ok',false,'code','invitation_unavailable'); end if;
  -- Lock order matches management/import: event first, guest second. Recheck
  -- token and real clock after locks, including concurrent link rotation.
  select * into event_row from public.events where id=event_uuid for share;
  select * into guest_row from public.guests where id=guest_uuid and invite_token=p_token for update;
  checked_at:=clock_timestamp();
  if guest_row.id is null or event_row.deleted_at is not null or event_row.status<>'active' or checked_at<event_row.session_opens_at or checked_at>=event_row.session_closes_at then return jsonb_build_object('ok',false,'code','invitation_unavailable'); end if;
  action_name:=p_request->>'action';
  gate:=private.take_invitation_limit(case when action_name='read' then 'read' else 'write' end,guest_uuid::text,guest_uuid,case when action_name='read' then 30 else 6 end);
  if not (gate->>'allowed')::boolean then return jsonb_build_object('ok',false,'code','rate_limited','retry_after',gate->'retry_after'); end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>1024 then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  if action_name in ('read','opt_out') then
    if exists(select 1 from jsonb_object_keys(p_request) k where k<>'action') then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
    if action_name='opt_out' and not guest_row.opted_out then
      update public.guests set opted_out=true where id=guest_uuid returning * into guest_row;
    end if;
    return private.invitation_snapshot(guest_row,event_row);
  end if;
  if action_name is distinct from 'respond' or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','response','companions','expected_version')) then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  if event_row.rsvp_deadline is not null and clock_timestamp()>=event_row.rsvp_deadline then return jsonb_build_object('ok',false,'code','rsvp_closed'); end if;
  response_name:=p_request->>'response';
  if response_name is null or response_name not in ('yes','no','maybe') or jsonb_typeof(p_request->'response')<>'string'
    or jsonb_typeof(p_request->'companions') is distinct from 'number' or p_request->>'companions' !~ '^[0-9]{1,2}$'
    or jsonb_typeof(p_request->'expected_version') is distinct from 'number' or p_request->>'expected_version' !~ '^[0-9]{1,9}$' then return jsonb_build_object('ok',false,'code','invalid_response'); end if;
  companion_count:=(p_request->>'companions')::integer;
  expected_version:=(p_request->>'expected_version')::integer;
  if companion_count>guest_row.companions_allowed or (response_name<>'yes' and companion_count<>0) then return jsonb_build_object('ok',false,'code','invalid_companions'); end if;
  -- Exact retries are idempotent and preserve the original timestamp/version.
  if guest_row.rsvp_status::text=response_name and guest_row.companions_confirmed=companion_count then return private.invitation_snapshot(guest_row,event_row); end if;
  if guest_row.rsvp_version<>expected_version then return jsonb_build_object('ok',false,'code','response_changed'); end if;
  update public.guests set rsvp_status=response_name::public.guest_rsvp_status,companions_confirmed=companion_count,rsvp_at=clock_timestamp(),rsvp_version=rsvp_version+1
    where id=guest_uuid returning * into guest_row;
  return private.invitation_snapshot(guest_row,event_row);
end;
$$;

create function public.get_guest_invitation_token(p_event_id uuid,p_guest_id uuid,p_rotate boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare raw_token text;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'guests.write') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501'; end if;
  select invite_token into raw_token from public.guests where event_id=p_event_id and id=p_guest_id for update;
  if raw_token is null then raise exception 'guest_unavailable' using errcode='22023'; end if;
  if p_rotate then
    raw_token:=encode(extensions.gen_random_bytes(32),'hex');
    update public.guests set invite_token=raw_token where id=p_guest_id;
  end if;
  insert into public.audit_log(event_id,actor_id,action,target) values(p_event_id,auth.uid(),'guest.link_accessed',p_guest_id);
  return raw_token;
end;
$$;

create function public.configure_event_access(p_event_id uuid,p_opens_at timestamptz,p_closes_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'event.update') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_opens_at is null or p_closes_at is null or not isfinite(p_opens_at) or not isfinite(p_closes_at) or p_closes_at<=p_opens_at then raise exception 'invalid_access_window' using errcode='22023'; end if;
  update public.events set session_opens_at=p_opens_at,session_closes_at=p_closes_at where id=p_event_id;
end;
$$;

-- General event edits must preserve a deliberately configured access window.
create or replace function public.update_event(p_event_id uuid,p_title text,p_slug text,p_type public.event_type,p_starts_at timestamptz,p_timezone text,p_rsvp_deadline timestamptz default null,p_status public.event_status default 'draft')
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'event.update') then raise exception 'forbidden' using errcode='42501'; end if;
  update public.events set title=p_title,slug=p_slug,type=p_type,starts_at=p_starts_at,timezone=p_timezone,rsvp_deadline=p_rsvp_deadline,status=p_status where id=p_event_id;
end;
$$;

create or replace function public.audit_guest_changes()
returns trigger language plpgsql security definer set search_path='' as $$
declare event_uuid uuid:=coalesce(new.event_id,old.event_id); action_name text; details jsonb:='{}';
begin
  if tg_op<>'DELETE' then new.updated_at:=clock_timestamp(); end if;
  action_name:=case tg_op when 'INSERT' then 'guest.created' when 'DELETE' then 'guest.deleted' else 'guest.updated' end;
  if tg_op='UPDATE' then
    if new.rsvp_version<>old.rsvp_version then action_name:='guest.rsvp_updated'; details:=jsonb_build_object('response',new.rsvp_status,'companions',new.companions_confirmed,'version',new.rsvp_version);
    elsif new.opted_out and not old.opted_out then action_name:='guest.opted_out';
    elsif new.invite_token is distinct from old.invite_token then action_name:='guest.link_rotated'; end if;
  end if;
  if exists(select 1 from public.events where id=event_uuid) then
    insert into public.audit_log(event_id,actor_id,action,target,meta) values(event_uuid,auth.uid(),action_name,coalesce(new.id,old.id),details);
  end if;
  return coalesce(new,old);
end;
$$;

-- Keep the existing contact projection; enrich only its full-access branch.
-- The checkin projection remains strictly name/table only.
create or replace function public.list_guests(p_event_id uuid,p_search text default '',p_group text default '',p_contact text default 'all',p_page integer default 0,p_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; full_access boolean;
begin
  full_access:=public.has_event_permission(p_event_id,'guests.read') and public.has_event_permission(p_event_id,'guests.contact_read');
  if not full_access and not public.has_event_permission(p_event_id,'checkin.write') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_page is null or p_page<0 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 100 or char_length(coalesce(p_search,''))>160 or char_length(coalesce(p_group,''))>80 or p_contact is null or p_contact not in ('all','with_contact','without_contact') then raise exception 'invalid_filters' using errcode='22023'; end if;
  if not full_access and (coalesce(p_group,'')<>'' or p_contact<>'all') then raise exception 'forbidden' using errcode='42501'; end if;
  if full_access then
    with filtered as materialized (
      select id,event_id,full_name,email,phone,document_id,group_label,companions_allowed,contact_consent,created_at,updated_at,rsvp_status,rsvp_at,companions_confirmed,opted_out,rsvp_version
      from public.guests where event_id=p_event_id
        and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',full_name,email,phone,document_id,group_label)),lower(p_search))>0)
        and (coalesce(p_group,'')='' or group_label=p_group)
        and (p_contact='all' or (p_contact='with_contact' and (email is not null or phone is not null)) or (p_contact='without_contact' and email is null and phone is null))
    ), paged as (select * from filtered order by lower(full_name),id limit p_page_size offset p_page*p_page_size)
    select jsonb_build_object('scope','full','total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
      'groups',coalesce((select jsonb_agg(group_label order by group_label) from (select distinct group_label from public.guests where event_id=p_event_id and group_label is not null) groups),'[]'::jsonb)) into result;
  else
    with filtered as materialized (select id,event_id,full_name,table_id from public.guests where event_id=p_event_id and (coalesce(p_search,'')='' or strpos(lower(full_name),lower(p_search))>0)),
      paged as (select * from filtered order by lower(full_name),id limit p_page_size offset p_page*p_page_size)
    select jsonb_build_object('scope','roster','total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'groups','[]'::jsonb) into result;
  end if;
  return result;
end;
$$;

revoke all on function private.take_invitation_limit(text,text,uuid,integer),private.invitation_snapshot(public.guests,public.events),public.guest_invitation(text,jsonb),public.get_guest_invitation_token(uuid,uuid,boolean),public.configure_event_access(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.guest_invitation(text,jsonb) to anon,authenticated;
grant execute on function public.get_guest_invitation_token(uuid,uuid,boolean),public.configure_event_access(uuid,timestamptz,timestamptz) to authenticated;
commit;

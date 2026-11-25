begin;

alter table public.event_wall_settings add column stream_key text not null default encode(extensions.gen_random_bytes(32),'hex') unique;
alter table public.event_wall_settings add column public_revision bigint not null default 0 check(public_revision>=0);
alter table public.wall_posts add column publication_revision bigint not null default 0 check(publication_revision>=0);
alter table public.wall_posts add column ever_approved boolean not null default false;
create index wall_public_revision_idx on public.wall_posts(event_id,publication_revision) where ever_approved;

create table private.wall_projection_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  token_hash bytea not null,
  issued_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index wall_projection_issuer_idx on private.wall_projection_access(issued_by);
alter table private.wall_projection_access enable row level security;
revoke all on private.wall_projection_access from public,anon,authenticated;
alter table private.invitation_rate_limits drop constraint invitation_rate_limits_scope_check;
alter table private.invitation_rate_limits add constraint invitation_rate_limits_scope_check check(scope in ('global','read','write','wall_write','wall_upload','projection_read'));

-- Backfill publication state without republishing private or deleted content.
insert into public.event_wall_settings(event_id) select distinct event_id from public.wall_posts on conflict(event_id) do nothing;
with published as (
  select p.id,row_number() over(partition by p.event_id order by p.created_at,p.id) revision
  from public.wall_posts p where p.status='approved' or exists(
    select 1 from public.audit_log a where a.event_id=p.event_id and a.target=p.id and a.action in ('wall.moderated','wall.deleted') and (a.meta->>'from'='approved' or a.meta->>'to'='approved')
  )
)
update public.wall_posts p set ever_approved=true,publication_revision=published.revision from published where p.id=published.id;
update public.event_wall_settings s set public_revision=(select coalesce(max(p.publication_revision),0) from public.wall_posts p where p.event_id=s.event_id);

create function private.wall_public_post(p public.wall_posts) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'author_name',p.author_name,'participant_name',p.participant_name,'body',p.body,'created_at',p.created_at,
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'duration_seconds',m.duration_seconds) order by m.slot) from public.wall_post_media m where m.post_id=p.id and m.state='ready'),'[]'::jsonb));
$$;

-- A locked event revision is the watermark. Writers serialize this row before
-- committing, avoiding timestamp/MVCC gaps when changes occur during paging.
create function private.wall_sync(p_event_id uuid,p_after bigint,p_snapshot bigint) returns jsonb language plpgsql set search_path='' as $$
declare s public.event_wall_settings; e public.events; watermark bigint; changes jsonb; has_more boolean; next_revision bigint;
begin
  insert into public.event_wall_settings(event_id) values(p_event_id) on conflict(event_id) do nothing;
  select * into s from public.event_wall_settings where event_id=p_event_id for share;
  select * into e from public.events where id=p_event_id;
  if p_after is null or p_after<0 or p_after>s.public_revision or (p_snapshot is not null and (p_snapshot<p_after or p_snapshot>s.public_revision)) then return jsonb_build_object('ok',false,'code','refresh_required');end if;
  watermark:=coalesce(p_snapshot,s.public_revision);
  select coalesce(jsonb_agg(item order by publication_revision),'[]'::jsonb) into changes from (
    select p.publication_revision,jsonb_build_object('revision',p.publication_revision,'id',p.id,'post',case when p.status='approved' then private.wall_public_post(p) else null end) item
    from public.wall_posts p where p.event_id=p_event_id and p.ever_approved and p.publication_revision>p_after and p.publication_revision<=watermark order by p.publication_revision limit 51
  ) q;
  has_more:=jsonb_array_length(changes)>50;
  changes:=changes-50;
  next_revision:=case when has_more then (changes->-1->>'revision')::bigint else watermark end;
  return jsonb_build_object('ok',true,'changes',changes,'next_revision',next_revision,'snapshot_revision',watermark,'latest_revision',s.public_revision,'has_more',has_more,
    'stream_topic','wall-approved:'||s.stream_key,'server_time',clock_timestamp(),'access_expires_at',e.session_closes_at,
    'can_post',s.enabled and clock_timestamp()>=coalesce(s.opens_at,e.session_opens_at) and clock_timestamp()<coalesce(s.closes_at,e.session_closes_at),
    'enabled',s.enabled,'opens_at',greatest(coalesce(s.opens_at,e.session_opens_at),e.session_opens_at),'closes_at',least(coalesce(s.closes_at,e.session_closes_at),e.session_closes_at),'audio_max_seconds',s.audio_max_seconds);
end;
$$;

create function public.sync_guest_wall(p_token text,p_after_revision bigint default 0,p_snapshot_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare gate jsonb;event_uuid uuid;
begin
  gate:=public.guest_invitation(p_token,'{"action":"read"}');
  if not coalesce((gate->>'ok')::boolean,false) then return gate;end if;
  select event_id into event_uuid from public.guests where invite_token=p_token;
  return private.wall_sync(event_uuid,p_after_revision,p_snapshot_revision);
end;
$$;

create function private.wall_prepare_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.event_wall_settings(event_id) values(new.event_id) on conflict(event_id) do nothing;
  new.ever_approved:=new.status='approved' or (tg_op='UPDATE' and old.ever_approved);
  if new.ever_approved then
    update public.event_wall_settings set public_revision=public_revision+1 where event_id=new.event_id returning public_revision into new.publication_revision;
  else new.publication_revision:=0;end if;
  return new;
end;
$$;
create trigger wall_prepare_public_revision before insert or update on public.wall_posts for each row execute function private.wall_prepare_revision();

create function private.wall_notify(p_event_id uuid,p_public boolean default true,p_moderation boolean default true) returns void language plpgsql security definer set search_path='' as $$
declare topic_key text;
begin
  if p_public then
    select stream_key into topic_key from public.event_wall_settings where event_id=p_event_id;
    if topic_key is not null then perform realtime.send('{}'::jsonb,'wall_changed','wall-approved:'||topic_key,true);end if;
  end if;
  if p_moderation then perform realtime.send('{}'::jsonb,'wall_changed','wall-moderation:'||p_event_id::text,true);end if;
end;
$$;
create function private.wall_notify_post() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.wall_notify(new.event_id,new.publication_revision>coalesce(old.publication_revision,0),new.status<>'draft');
  return null;
end;
$$;
create trigger wall_notify_post after insert or update on public.wall_posts for each row execute function private.wall_notify_post();

create function private.wall_notify_settings() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.wall_notify(new.event_id);return null;end;
$$;
create trigger wall_notify_settings after update of enabled,opens_at,closes_at,audio_max_seconds on public.event_wall_settings for each row execute function private.wall_notify_settings();
create function private.wall_notify_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    delete from private.invitation_rate_limits where scope='projection_read' and bucket=old.id::text;
    return old;
  end if;
  perform private.wall_notify(new.id);return new;
end;
$$;
create trigger wall_notify_event after update of status,session_opens_at,session_closes_at,deleted_at on public.events for each row execute function private.wall_notify_event();
create trigger wall_projection_limit_cleanup after delete on public.events for each row execute function private.wall_notify_event();

-- Only read permission is granted. Browsers cannot forge private broadcasts.
-- The opaque approved topic is an invalidation capability, never an invite
-- token; its payload is always empty. All content is reauthorized through RPC.
create function public.can_receive_wall_updates(p_topic text) returns boolean language sql stable security definer set search_path='' as $$
  select case when left(p_topic,16)='wall-moderation:' then
    exists(select 1 from public.events e where 'wall-moderation:'||e.id::text=p_topic and public.has_event_permission(e.id,'wall.moderate'))
  else exists(select 1 from public.event_wall_settings s join public.events e on e.id=s.event_id where 'wall-approved:'||s.stream_key=p_topic and e.deleted_at is null and e.status='active' and clock_timestamp()>=e.session_opens_at and clock_timestamp()<e.session_closes_at) end;
$$;
create policy wall_receive_private_broadcast on realtime.messages for select to anon,authenticated
  using(extension='broadcast' and public.can_receive_wall_updates((select realtime.topic())));

create function private.wall_projection_valid(p_event_id uuid,p_hash bytea) returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.wall_projection_access a where a.event_id=p_event_id and a.token_hash=p_hash and a.revoked_at is null and clock_timestamp()<a.expires_at
    and (exists(select 1 from public.event_members m where m.event_id=a.event_id and m.user_id=a.issued_by and 'wall.moderate'=any(public.event_role_permissions(m.role)))
      or exists(select 1 from public.profiles p where p.user_id=a.issued_by and p.platform_role='super_admin')));
$$;
create function public.get_wall_projection_status(p_event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.wall_projection_access;
begin
  if not public.has_event_permission(p_event_id,'wall.moderate') then raise exception 'not_authorized';end if;
  select * into a from private.wall_projection_access where event_id=p_event_id;
  return jsonb_build_object('active',coalesce(private.wall_projection_valid(p_event_id,a.token_hash),false),'expires_at',a.expires_at,'revoked_at',a.revoked_at);
end;
$$;
create function public.issue_wall_projection_access(p_event_id uuid,p_expires_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;until_time timestamptz;secret_value text;
begin
  select * into e from public.events where id=p_event_id for update;
  if e.id is null or not public.has_event_permission(p_event_id,'wall.moderate') then raise exception 'not_authorized';end if;
  if e.status<>'active' or clock_timestamp()<e.session_opens_at or clock_timestamp()>=e.session_closes_at then raise exception 'event_unavailable';end if;
  until_time:=least(coalesce(p_expires_at,clock_timestamp()+interval '4 hours'),e.session_closes_at);
  if not isfinite(until_time) or until_time<=clock_timestamp()+interval '5 seconds' or until_time>clock_timestamp()+interval '12 hours' then raise exception 'invalid_expiration';end if;
  secret_value:=encode(extensions.gen_random_bytes(32),'hex');
  insert into private.wall_projection_access(event_id,token_hash,issued_by,expires_at) values(p_event_id,extensions.digest(secret_value,'sha256'),auth.uid(),until_time)
    on conflict(event_id) do update set token_hash=excluded.token_hash,issued_by=excluded.issued_by,expires_at=excluded.expires_at,revoked_at=null,created_at=clock_timestamp();
  insert into public.event_wall_settings(event_id) values(p_event_id) on conflict(event_id) do nothing;
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'wall.projection_issued',p_event_id,jsonb_build_object('expires_at',until_time));
  perform private.wall_notify(p_event_id);
  return jsonb_build_object('access',secret_value,'expires_at',until_time,'slug',e.slug);
end;
$$;
create function public.revoke_wall_projection_access(p_event_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id and deleted_at is null for update;
  if not found or not public.has_event_permission(p_event_id,'wall.moderate') then raise exception 'not_authorized';end if;
  update private.wall_projection_access set revoked_at=clock_timestamp() where event_id=p_event_id and revoked_at is null;
  if found then insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'wall.projection_revoked',p_event_id,'{}');end if;
  perform private.wall_notify(p_event_id);
end;
$$;

create function public.projection_wall(p_slug text,p_access text,p_request jsonb default '{"action":"sync"}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;gate jsonb;a private.wall_projection_access;result jsonb;ids jsonb;after_value bigint;snapshot_value bigint;
begin
  perform set_config('response.headers','[{"Cache-Control":"no-store"},{"Referrer-Policy":"no-referrer"}]',true);
  if coalesce(current_setting('request.method',true),'POST') not in ('','POST') then return jsonb_build_object('ok',false,'code','invalid_request');end if;
  gate:=private.take_invitation_limit('global',(get_byte(extensions.digest(left(coalesce(p_access,''),128),'sha256'),0)%64)::text,null,120);
  if not (gate->>'allowed')::boolean then return jsonb_build_object('ok',false,'code','rate_limited','retry_after',gate->'retry_after');end if;
  if p_access is null or p_access !~ '^[a-f0-9]{64}$' or length(coalesce(p_slug,''))>80 then return jsonb_build_object('ok',false,'code','projection_unavailable');end if;
  select * into e from public.events where slug=p_slug for share;
  if e.id is null or e.deleted_at is not null or e.status<>'active' or clock_timestamp()<e.session_opens_at or clock_timestamp()>=e.session_closes_at or not private.wall_projection_valid(e.id,extensions.digest(p_access,'sha256')) then return jsonb_build_object('ok',false,'code','projection_unavailable');end if;
  select * into a from private.wall_projection_access where event_id=e.id for share;
  -- Recheck after waiting on revocation/rotation, using the real server clock.
  if not private.wall_projection_valid(e.id,extensions.digest(p_access,'sha256')) then return jsonb_build_object('ok',false,'code','projection_unavailable');end if;
  gate:=private.take_invitation_limit('projection_read',e.id::text,null,30);
  if not (gate->>'allowed')::boolean then return jsonb_build_object('ok',false,'code','rate_limited','retry_after',gate->'retry_after');end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>4096 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
  if p_request->>'action'='sync' then
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','after_revision','snapshot_revision')) or (p_request ? 'after_revision' and (jsonb_typeof(p_request->'after_revision')<>'number' or p_request->>'after_revision' !~ '^[0-9]{1,15}$')) or (p_request ? 'snapshot_revision' and (jsonb_typeof(p_request->'snapshot_revision')<>'number' or p_request->>'snapshot_revision' !~ '^[0-9]{1,15}$')) then return jsonb_build_object('ok',false,'code','invalid_request');end if;
    after_value:=coalesce((p_request->>'after_revision')::bigint,0);snapshot_value:=(p_request->>'snapshot_revision')::bigint;
    result:=private.wall_sync(e.id,after_value,snapshot_value);
    return result||jsonb_build_object('access_expires_at',least(a.expires_at,e.session_closes_at),'event',jsonb_build_object('title',e.title,'slug',e.slug,'timezone',e.timezone,'starts_at',e.starts_at));
  end if;
  if p_request->>'action'='manifest' then
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','post_ids')) or jsonb_typeof(p_request->'post_ids') is distinct from 'array' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
    ids:=p_request->'post_ids';if jsonb_array_length(ids)>25 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
    select coalesce(jsonb_agg(private.wall_paths(m)),'[]'::jsonb) into result from public.wall_post_media m join public.wall_posts p on p.id=m.post_id where p.event_id=e.id and p.status='approved' and m.state='ready' and to_jsonb(p.id::text)<@ids;
    return jsonb_build_object('ok',true,'media',result,'closes_at',least(a.expires_at,e.session_closes_at));
  end if;
  return jsonb_build_object('ok',false,'code','invalid_request');
end;
$$;

revoke all on function private.wall_public_post(public.wall_posts),private.wall_sync(uuid,bigint,bigint),private.wall_prepare_revision(),private.wall_notify(uuid,boolean,boolean),private.wall_notify_post(),private.wall_notify_settings(),private.wall_notify_event(),private.wall_projection_valid(uuid,bytea) from public,anon,authenticated;
revoke all on function public.sync_guest_wall(text,bigint,bigint),public.can_receive_wall_updates(text),public.get_wall_projection_status(uuid),public.issue_wall_projection_access(uuid,timestamptz),public.revoke_wall_projection_access(uuid),public.projection_wall(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_guest_wall(text,bigint,bigint),public.can_receive_wall_updates(text),public.projection_wall(text,text,jsonb) to anon,authenticated;
grant execute on function public.get_wall_projection_status(uuid),public.issue_wall_projection_access(uuid,timestamptz),public.revoke_wall_projection_access(uuid) to authenticated;
commit;

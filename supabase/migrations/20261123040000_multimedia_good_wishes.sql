begin;

-- A dedication belongs to a bearer invitation, independently of its RSVP.
create table public.event_wall_settings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  enabled boolean not null default true,
  opens_at timestamptz,
  closes_at timestamptz,
  audio_max_seconds integer not null default 60 check(audio_max_seconds between 15 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(opens_at is null or isfinite(opens_at)),
  check(closes_at is null or isfinite(closes_at)),
  check(opens_at is null or closes_at is null or opens_at<closes_at)
);
create table public.wall_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  author_name text not null check(length(author_name) between 1 and 200),
  participant_name text check(length(participant_name) between 1 and 80),
  body text not null default '' check(length(body)<=2000),
  status text not null default 'draft' check(status in ('draft','pending','approved','rejected','hidden','deleted')),
  photo_count integer not null default 0 check(photo_count between 0 and 3),
  audio_count integer not null default 0 check(audio_count between 0 and 1),
  request_id uuid not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,
  unique(guest_id,request_id),
  unique(id,event_id)
);
create index wall_posts_event_status_time_idx on public.wall_posts(event_id,status,created_at,id);
create index wall_posts_guest_time_idx on public.wall_posts(guest_id,created_at);
create index wall_posts_moderator_idx on public.wall_posts(moderated_by);
create table public.wall_post_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  post_id uuid not null,
  slot integer not null check(slot between 0 and 3),
  kind text not null check(kind in ('photo','audio')),
  state text not null default 'reserved' check(state in ('reserved','ready','deleted')),
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  byte_count integer not null check(byte_count between 16 and 3840044),
  duration_seconds numeric check(duration_seconds>0 and duration_seconds<=120),
  created_at timestamptz not null default now(),
  unique(post_id,slot),
  foreign key(post_id,event_id) references public.wall_posts(id,event_id) on delete cascade,
  check((kind='photo' and slot<3 and byte_count<=2000000 and duration_seconds is null) or (kind='audio' and slot=3 and duration_seconds is not null))
);
create index wall_media_event_state_idx on public.wall_post_media(event_id,state);

alter table public.event_wall_settings enable row level security;
alter table public.wall_posts enable row level security;
alter table public.wall_post_media enable row level security;
revoke all on public.event_wall_settings,public.wall_posts,public.wall_post_media from public,anon,authenticated;
grant select on public.event_wall_settings,public.wall_posts,public.wall_post_media to authenticated;
create policy wall_settings_read on public.event_wall_settings for select to authenticated using(public.has_event_permission(event_id,'wall.moderate') or public.has_event_permission(event_id,'event.update'));
create policy wall_posts_moderator_read on public.wall_posts for select to authenticated using(public.has_event_permission(event_id,'wall.moderate'));
create policy wall_media_moderator_read on public.wall_post_media for select to authenticated using(public.has_event_permission(event_id,'wall.moderate'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wall-media','wall-media',false,1000000,array['image/webp']),('wall-audio','wall-audio',false,3840044,array['audio/wav']);
create policy wall_media_private_moderation on storage.objects for select to authenticated using(
  bucket_id in ('wall-media','wall-audio') and exists(
    select 1 from public.wall_post_media m join public.wall_posts p on p.id=m.post_id
    where m.state='ready' and p.status<>'deleted' and public.has_event_permission(m.event_id,'wall.moderate')
      and storage.objects.name=m.event_id::text||'/'||m.id::text||case when m.kind='audio' then '/audio.wav' when storage.objects.name like '%/small.webp' then '/small.webp' else '/large.webp' end
      and storage.objects.bucket_id=case when m.kind='audio' then 'wall-audio' else 'wall-media' end
  )
);
-- Reuse the existing committed, bounded limiter rather than storing tokens/IPs.
alter table private.invitation_rate_limits drop constraint invitation_rate_limits_scope_check;
alter table private.invitation_rate_limits add constraint invitation_rate_limits_scope_check check(scope in ('global','read','write','wall_write','wall_upload'));

create function private.wall_paths(p_media public.wall_post_media) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_media.id,'kind',p_media.kind,'bucket',case when p_media.kind='audio' then 'wall-audio' else 'wall-media' end,
    'paths',case when p_media.kind='audio' then jsonb_build_array(p_media.event_id::text||'/'||p_media.id::text||'/audio.wav')
      else jsonb_build_array(p_media.event_id::text||'/'||p_media.id::text||'/large.webp',p_media.event_id::text||'/'||p_media.id::text||'/small.webp') end);
$$;

create function public.configure_event_wall(p_event_id uuid,p_enabled boolean,p_opens_at timestamptz,p_closes_at timestamptz,p_audio_max_seconds integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id and deleted_at is null for update;
  if not found or not public.has_event_permission(p_event_id,'event.update') then raise exception 'not_authorized'; end if;
  insert into public.event_wall_settings(event_id,enabled,opens_at,closes_at,audio_max_seconds)
    values(p_event_id,p_enabled,p_opens_at,p_closes_at,p_audio_max_seconds)
  on conflict(event_id) do update set enabled=excluded.enabled,opens_at=excluded.opens_at,closes_at=excluded.closes_at,audio_max_seconds=excluded.audio_max_seconds,updated_at=clock_timestamp();
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'wall.settings_updated',p_event_id,jsonb_build_object('enabled',p_enabled,'audio_max_seconds',p_audio_max_seconds));
end;
$$;

-- All guest actions inherit token validation, event/guest locks, access windows
-- and global/read quotas. No visit ID is passed: this never fabricates opens.
create function public.guest_wall(p_token text,p_request jsonb default '{"action":"list"}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare gate jsonb; g public.guests; e public.events; s public.event_wall_settings; p public.wall_posts; m public.wall_post_media;
  action_name text; checked_at timestamptz; can_post boolean; post_uuid uuid; request_uuid uuid; after_uuid uuid;
  rows_json jsonb; payload_hash text; expected_photos integer; expected_audio integer; slot_value integer; byte_value integer; duration_value numeric;
begin
  gate:=public.guest_invitation(p_token,'{"action":"read"}');
  if not coalesce((gate->>'ok')::boolean,false) then return gate; end if;
  select * into g from public.guests where invite_token=p_token;
  select * into e from public.events where id=g.event_id;
  select * into s from public.event_wall_settings where event_id=g.event_id;
  checked_at:=clock_timestamp();
  can_post:=coalesce(s.enabled,true) and checked_at>=coalesce(s.opens_at,e.session_opens_at) and checked_at<coalesce(s.closes_at,e.session_closes_at);
  if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>10000 then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  action_name:=p_request->>'action';
  if action_name='list' then
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','after_id')) then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
    if p_request ? 'after_id' then
      if coalesce(p_request->>'after_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
      after_uuid:=(p_request->>'after_id')::uuid;
      select * into p from public.wall_posts where id=after_uuid and event_id=g.event_id and status='approved';
      if not found then return jsonb_build_object('ok',false,'code','refresh_required'); end if;
    end if;
    select coalesce(jsonb_agg(item order by created_at,id),'[]'::jsonb) into rows_json from (
      select w.created_at,w.id,jsonb_build_object('id',w.id,'author_name',w.author_name,'participant_name',w.participant_name,'body',w.body,'created_at',w.created_at,
        'media',coalesce((select jsonb_agg(jsonb_build_object('id',wm.id,'kind',wm.kind,'duration_seconds',wm.duration_seconds) order by wm.slot) from public.wall_post_media wm where wm.post_id=w.id and wm.state='ready'),'[]'::jsonb)) item
      from public.wall_posts w where w.event_id=g.event_id and w.status='approved' and (after_uuid is null or (w.created_at,w.id)>(p.created_at,p.id)) order by w.created_at,w.id limit 26
    ) q;
    return jsonb_build_object('ok',true,'posts',rows_json-25,'has_more',jsonb_array_length(rows_json)>25,'can_post',can_post,'enabled',coalesce(s.enabled,true),'opens_at',coalesce(s.opens_at,e.session_opens_at),'closes_at',least(coalesce(s.closes_at,e.session_closes_at),e.session_closes_at),'audio_max_seconds',coalesce(s.audio_max_seconds,60),'server_time',checked_at);
  end if;
  if action_name='manifest' then
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','post_ids')) or jsonb_typeof(p_request->'post_ids') is distinct from 'array' or jsonb_array_length(p_request->'post_ids')>25 then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
    select coalesce(jsonb_agg(private.wall_paths(wm)),'[]'::jsonb) into rows_json
      from public.wall_post_media wm join public.wall_posts w on w.id=wm.post_id
      where w.event_id=g.event_id and w.status='approved' and wm.state='ready' and to_jsonb(w.id::text)<@p_request->'post_ids';
    return jsonb_build_object('ok',true,'media',rows_json,'closes_at',e.session_closes_at);
  end if;
  gate:=private.take_invitation_limit(case when action_name='reserve' then 'wall_upload' else 'wall_write' end,g.id::text,g.id,case when action_name='reserve' then 12 else 8 end);
  if not (gate->>'allowed')::boolean then return jsonb_build_object('ok',false,'code','rate_limited','retry_after',gate->'retry_after'); end if;
  if action_name='begin' then
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','body','participant_name','photo_count','audio_count','request_id'))
      or jsonb_typeof(p_request->'body') is distinct from 'string' or length(p_request->>'body')>2000
      or coalesce(p_request->>'request_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or jsonb_typeof(p_request->'photo_count') is distinct from 'number' or coalesce(p_request->>'photo_count','') !~ '^[0-3]$'
      or jsonb_typeof(p_request->'audio_count') is distinct from 'number' or coalesce(p_request->>'audio_count','') !~ '^[0-1]$'
      or (p_request ? 'participant_name' and (jsonb_typeof(p_request->'participant_name') is distinct from 'string' or length(btrim(p_request->>'participant_name')) not between 1 and 80 or g.party_size=1)) then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
    expected_photos:=(p_request->>'photo_count')::integer; expected_audio:=(p_request->>'audio_count')::integer;
    if btrim(p_request->>'body')='' and expected_photos+expected_audio=0 then return jsonb_build_object('ok',false,'code','empty_post'); end if;
    request_uuid:=(p_request->>'request_id')::uuid;
    payload_hash:=encode(extensions.digest((p_request-'action')::text,'sha256'),'hex');
    select * into p from public.wall_posts where guest_id=g.id and request_id=request_uuid;
    if found then
      if p.request_hash<>payload_hash or p.status='deleted' then return jsonb_build_object('ok',false,'code','request_conflict'); end if;
      return jsonb_build_object('ok',true,'post_id',p.id,'status',p.status);
    end if;
    if not can_post then return jsonb_build_object('ok',false,'code','wall_closed'); end if;
    if (select count(*) from public.wall_posts where guest_id=g.id and created_at>checked_at-interval '10 minutes')>=3 or (select count(*) from public.wall_posts where guest_id=g.id and created_at>checked_at-interval '24 hours')>=20 then return jsonb_build_object('ok',false,'code','post_limit'); end if;
    insert into public.wall_posts(event_id,guest_id,author_name,participant_name,body,photo_count,audio_count,request_id,request_hash)
      values(g.event_id,g.id,g.full_name,nullif(btrim(p_request->>'participant_name'),''),btrim(p_request->>'body'),expected_photos,expected_audio,request_uuid,payload_hash) returning * into p;
    return jsonb_build_object('ok',true,'post_id',p.id,'status',p.status);
  end if;
  if coalesce(p_request->>'post_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  post_uuid:=(p_request->>'post_id')::uuid;
  select * into p from public.wall_posts where id=post_uuid and guest_id=g.id and event_id=g.event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','post_unavailable'); end if;
  if action_name='cancel' then
    if p.status not in ('draft','deleted') or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','post_id')) then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
    update public.wall_posts set status='deleted',body='',participant_name=null,author_name='Publicación eliminada' where id=p.id;
    select coalesce(jsonb_agg(private.wall_paths(wm)),'[]'::jsonb) into rows_json from public.wall_post_media wm where post_id=p.id;
    return jsonb_build_object('ok',true,'media',rows_json);
  end if;
  if action_name='submit' then
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','post_id')) then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
    if p.status in ('pending','approved','rejected','hidden') then return jsonb_build_object('ok',true,'post_id',p.id,'status',p.status); end if;
    if not can_post then return jsonb_build_object('ok',false,'code','wall_closed'); end if;
    if p.status<>'draft' or (select count(*) from public.wall_post_media where post_id=p.id and kind='photo' and state='ready')<>p.photo_count or (select count(*) from public.wall_post_media where post_id=p.id and kind='audio' and state='ready')<>p.audio_count then return jsonb_build_object('ok',false,'code','media_incomplete'); end if;
    update public.wall_posts set status='pending',submitted_at=clock_timestamp() where id=p.id;
    insert into public.audit_log(event_id,action,target,meta) values(p.event_id,'wall.submitted',p.id,jsonb_build_object('photos',p.photo_count,'audio',p.audio_count));
    return jsonb_build_object('ok',true,'post_id',p.id,'status','pending');
  end if;
  if action_name='reserve' then
    if not can_post then return jsonb_build_object('ok',false,'code','wall_closed'); end if;
    if p.status<>'draft' or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','post_id','slot','kind','fingerprint','byte_count','duration_seconds'))
      or jsonb_typeof(p_request->'slot') is distinct from 'number' or coalesce(p_request->>'slot','') !~ '^[0-3]$'
      or jsonb_typeof(p_request->'byte_count') is distinct from 'number' or coalesce(p_request->>'byte_count','') !~ '^[0-9]{2,7}$'
      or coalesce(p_request->>'fingerprint','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','invalid_media'); end if;
    slot_value:=(p_request->>'slot')::integer; byte_value:=(p_request->>'byte_count')::integer;
    if p_request->>'kind'='photo' then
      if slot_value>=p.photo_count or byte_value>2000000 or p_request ? 'duration_seconds' then return jsonb_build_object('ok',false,'code','invalid_media'); end if;
    elsif p_request->>'kind'='audio' then
      if slot_value<>3 or p.audio_count<>1 or jsonb_typeof(p_request->'duration_seconds') is distinct from 'number' or byte_value>3840044 then return jsonb_build_object('ok',false,'code','invalid_media'); end if;
      duration_value:=(p_request->>'duration_seconds')::numeric;
      if duration_value<=0 or duration_value>coalesce(s.audio_max_seconds,60) then return jsonb_build_object('ok',false,'code','invalid_media'); end if;
    else return jsonb_build_object('ok',false,'code','invalid_media'); end if;
    select * into m from public.wall_post_media where post_id=p.id and slot=slot_value;
    if found then
      if m.fingerprint<>p_request->>'fingerprint' or m.kind<>p_request->>'kind' or m.byte_count<>byte_value then return jsonb_build_object('ok',false,'code','request_conflict'); end if;
      return jsonb_build_object('ok',true,'media',private.wall_paths(m),'ready',m.state='ready');
    end if;
    -- Serialize this event's storage budget (including abandoned reservations).
    perform pg_advisory_xact_lock(hashtextextended(p.event_id::text,73421));
    if (select coalesce(sum(byte_count),0) from public.wall_post_media where event_id=p.event_id and state<>'deleted')+byte_value>200000000 then return jsonb_build_object('ok',false,'code','storage_limit'); end if;
    insert into public.wall_post_media(event_id,post_id,slot,kind,fingerprint,byte_count,duration_seconds)
      values(p.event_id,p.id,slot_value,p_request->>'kind',p_request->>'fingerprint',byte_value,duration_value) returning * into m;
    return jsonb_build_object('ok',true,'media',private.wall_paths(m),'ready',false);
  end if;
  return jsonb_build_object('ok',false,'code','invalid_request');
end;
$$;

-- Attestation is only callable by the server after byte-level inspection and
-- Storage upload. A browser cannot forge readiness by reserving metadata.
create function public.complete_wall_media(p_media_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.wall_post_media; p public.wall_posts; e public.events; s public.event_wall_settings;
begin
  select * into m from public.wall_post_media where id=p_media_id;
  select * into e from public.events where id=m.event_id for share;
  select * into p from public.wall_posts where id=m.post_id for update;
  select * into s from public.event_wall_settings where event_id=m.event_id;
  if p.id is null or p.status<>'draft' or e.deleted_at is not null or e.status<>'active' or clock_timestamp()<e.session_opens_at or clock_timestamp()>=e.session_closes_at
    or not coalesce(s.enabled,true) or clock_timestamp()<coalesce(s.opens_at,e.session_opens_at) or clock_timestamp()>=coalesce(s.closes_at,e.session_closes_at)
    or (m.kind='audio' and m.duration_seconds>coalesce(s.audio_max_seconds,60)) then raise exception 'post_unavailable'; end if;
  update public.wall_post_media set state='ready' where id=m.id and state<>'deleted';
end;
$$;

create function public.moderate_wall_post(p_post_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare p public.wall_posts; event_uuid uuid;
begin
  select event_id into event_uuid from public.wall_posts where id=p_post_id;
  perform 1 from public.events where id=event_uuid and deleted_at is null for share;
  if not found or not public.has_event_permission(event_uuid,'wall.moderate') then raise exception 'not_authorized'; end if;
  select * into p from public.wall_posts where id=p_post_id for update;
  if p.status not in ('pending','approved','rejected','hidden') or p_status not in ('approved','rejected','hidden') or p_status is null then raise exception 'invalid_status'; end if;
  if p.status=p_status then return; end if;
  update public.wall_posts set status=p_status,moderated_at=clock_timestamp(),moderated_by=auth.uid() where id=p.id;
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p.event_id,auth.uid(),'wall.moderated',p.id,jsonb_build_object('from',p.status,'to',p_status));
end;
$$;

-- Logical deletion revokes future manifests first. Physical removal is retried
-- by the Edge handler; retained tombstones preserve abuse counts and auditing.
create function public.delete_wall_post(p_post_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.wall_posts; event_uuid uuid; media_json jsonb;
begin
  select event_id into event_uuid from public.wall_posts where id=p_post_id;
  perform 1 from public.events where id=event_uuid and deleted_at is null for share;
  if not found or not public.has_event_permission(event_uuid,'wall.moderate') then raise exception 'not_authorized'; end if;
  select * into p from public.wall_posts where id=p_post_id for update;
  if p.status<>'deleted' then
    update public.wall_posts set status='deleted',body='',participant_name=null,author_name='Publicación eliminada',moderated_at=clock_timestamp(),moderated_by=auth.uid() where id=p.id;
    insert into public.audit_log(event_id,actor_id,action,target,meta) values(p.event_id,auth.uid(),'wall.deleted',p.id,jsonb_build_object('from',p.status));
  end if;
  select coalesce(jsonb_agg(private.wall_paths(m)),'[]'::jsonb) into media_json from public.wall_post_media m where post_id=p.id and state<>'deleted';
  return jsonb_build_object('ok',true,'media',media_json);
end;
$$;
create function public.finish_wall_purge(p_post_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.wall_post_media set state='deleted' where post_id=p_post_id and exists(select 1 from public.wall_posts where id=p_post_id and status='deleted');
end;
$$;

revoke all on function private.wall_paths(public.wall_post_media) from public,anon,authenticated;
revoke all on function public.configure_event_wall(uuid,boolean,timestamptz,timestamptz,integer),public.guest_wall(text,jsonb),public.complete_wall_media(uuid),public.moderate_wall_post(uuid,text),public.delete_wall_post(uuid),public.finish_wall_purge(uuid) from public,anon,authenticated;
grant execute on function public.guest_wall(text,jsonb) to anon,authenticated;
grant execute on function public.configure_event_wall(uuid,boolean,timestamptz,timestamptz,integer),public.moderate_wall_post(uuid,text),public.delete_wall_post(uuid) to authenticated;
grant execute on function public.complete_wall_media(uuid),public.finish_wall_purge(uuid) to service_role;

commit;

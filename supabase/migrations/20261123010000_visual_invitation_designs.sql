begin;

create table public.event_invitation_designs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  draft jsonb not null check(jsonb_typeof(draft)='object'),
  published jsonb check(published is null or jsonb_typeof(published)='object'),
  revision integer not null default 0 check(revision>=0),
  published_revision integer,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.event_invitation_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'reserved' check(status in ('reserved','ready','deleted')),
  alt text not null check(char_length(btrim(alt)) between 1 and 240),
  width integer check(width between 16 and 2400),
  height integer check(height between 16 and 2400),
  bytes integer check(bytes between 1 and 2097152),
  created_at timestamptz not null default clock_timestamp(),
  unique(id,event_id)
);
create index invitation_assets_event_status_idx on public.event_invitation_assets(event_id,status,created_at);
create index invitation_assets_creator_idx on public.event_invitation_assets(created_by,created_at);
alter table public.event_invitation_designs enable row level security;
alter table public.event_invitation_assets enable row level security;
revoke all on public.event_invitation_designs,public.event_invitation_assets from public,anon,authenticated;
grant select on public.event_invitation_designs,public.event_invitation_assets to authenticated;
create policy invitation_designs_editor_read on public.event_invitation_designs for select to authenticated using(public.has_event_permission(event_id,'content.write'));
create policy invitation_assets_editor_read on public.event_invitation_assets for select to authenticated using(public.has_event_permission(event_id,'content.write'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-assets','event-assets',false,2097152,array['image/webp'])
on conflict(id) do nothing;
-- No client INSERT/UPDATE/DELETE. Validated uploads go through the Edge Function.
create policy event_assets_editor_read on storage.objects for select to authenticated using(
  bucket_id='event-assets' and exists(select 1 from public.event_invitation_assets a
    where a.status='ready' and public.has_event_permission(a.event_id,'content.write')
      and name in (a.event_id::text||'/'||a.id::text||'/large.webp',a.event_id::text||'/'||a.id::text||'/small.webp'))
);

create function private.design_asset_ids(p_design jsonb)
returns uuid[] language sql immutable set search_path='' as $$
  select coalesce(array_agg(distinct id),'{}'::uuid[]) from (
    select nullif(p_design->>'cover_asset_id','')::uuid as id
    union all select (g->>'asset_id')::uuid from jsonb_array_elements(coalesce(p_design->'gallery','[]'::jsonb)) g
  ) source where id is not null;
$$;

create function private.validate_invitation_design(p_design jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare item jsonb; value text; key_name text;
begin
  if p_design is null or jsonb_typeof(p_design)<>'object' or octet_length(p_design::text)>24000 or p_design::text ~ '[a-fA-F0-9]{64}'
    or exists(select 1 from jsonb_object_keys(p_design) k where k not in ('version','template','palette','font_pair','names','eyebrow','welcome','show_guest_name','closing','dress_code','details','cover_asset_id','cover_focus','gallery','schedule','sections'))
    or (select count(*) from jsonb_object_keys(p_design))<>16
    or p_design->>'version' is distinct from '1'
    or coalesce(p_design->>'template','') not in ('romantic','festive','minimal')
    or coalesce(p_design->>'palette','') not in ('olive','rose','night')
    or coalesce(p_design->>'font_pair','') not in ('classic','modern','editorial')
    or coalesce(p_design->>'cover_focus','') not in ('center','top','bottom')
    or jsonb_typeof(p_design->'show_guest_name')<>'boolean'
    or jsonb_typeof(p_design->'gallery')<>'array' or jsonb_array_length(p_design->'gallery')>8
    or jsonb_typeof(p_design->'schedule')<>'array' or jsonb_array_length(p_design->'schedule')>4
    or jsonb_typeof(p_design->'sections')<>'array' or jsonb_array_length(p_design->'sections')<>8
    then raise exception 'invalid_design' using errcode='22023';end if;
  foreach key_name in array array['names','eyebrow','welcome','closing','dress_code','details'] loop
    if jsonb_typeof(p_design->key_name)<>'string' then raise exception 'invalid_design' using errcode='22023';end if;
    value:=p_design->>key_name;
    if char_length(value)>(case key_name when 'names' then 160 when 'eyebrow' then 80 when 'closing' then 600 when 'dress_code' then 300 else 1600 end) then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  if p_design->'cover_asset_id'<>'null'::jsonb and (jsonb_typeof(p_design->'cover_asset_id')<>'string' or p_design->>'cover_asset_id' !~ '^[a-f0-9-]{36}$') then raise exception 'invalid_design' using errcode='22023';end if;
  if (select count(distinct s->>'id') from jsonb_array_elements(p_design->'sections') s)<>8 then raise exception 'invalid_design' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_design->'sections') loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2 or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','enabled')) or coalesce(item->>'id','') not in ('welcome','countdown','schedule','dress','gallery','details','rsvp','closing') or jsonb_typeof(item->'enabled')<>'boolean' then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  for item in select * from jsonb_array_elements(p_design->'gallery') loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2 or exists(select 1 from jsonb_object_keys(item) k where k not in ('asset_id','caption')) or jsonb_typeof(item->'asset_id')<>'string' or item->>'asset_id' !~ '^[a-f0-9-]{36}$' or jsonb_typeof(item->'caption')<>'string' or char_length(item->>'caption')>240 then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  if (select count(distinct g->>'asset_id') from jsonb_array_elements(p_design->'gallery') g)<>jsonb_array_length(p_design->'gallery') then raise exception 'invalid_design' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_design->'schedule') loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>7
      or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','label','venue','address','starts_at','latitude','longitude'))
      or jsonb_typeof(item->'id')<>'string' or item->>'id' !~ '^[a-f0-9-]{36}$' or jsonb_typeof(item->'label')<>'string' or char_length(btrim(item->>'label')) not between 1 and 80
      or jsonb_typeof(item->'venue')<>'string' or char_length(item->>'venue')>160
      or jsonb_typeof(item->'address')<>'string' or char_length(item->>'address')>300
      or jsonb_typeof(item->'starts_at')<>'string' or item->>'starts_at' !~ '^\d{4}-\d{2}-\d{2}T.*Z$'
      or (item->'latitude'<>'null'::jsonb and (jsonb_typeof(item->'latitude')<>'number' or (item->>'latitude')::numeric not between -90 and 90))
      or (item->'longitude'<>'null'::jsonb and (jsonb_typeof(item->'longitude')<>'number' or (item->>'longitude')::numeric not between -180 and 180))
      or ((item->'latitude'='null'::jsonb)<>(item->'longitude'='null'::jsonb))
      then raise exception 'invalid_design' using errcode='22023';end if;
    perform (item->>'starts_at')::timestamptz;
  end loop;
  perform private.design_asset_ids(p_design);
exception when others then raise exception 'invalid_design' using errcode='22023';
end;
$$;

create function public.save_invitation_design(p_event_id uuid,p_design jsonb,p_expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare row_value public.event_invitation_designs; next_revision integer;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'content.write') then raise exception 'forbidden' using errcode='42501';end if;
  perform private.validate_invitation_design(p_design);
  if exists(select 1 from unnest(private.design_asset_ids(p_design)) id where not exists(select 1 from public.event_invitation_assets a where a.id=id and a.event_id=p_event_id and a.status='ready')) then raise exception 'asset_unavailable' using errcode='22023';end if;
  select * into row_value from public.event_invitation_designs where event_id=p_event_id for update;
  if p_expected_revision is null or coalesce(row_value.revision,0)<>p_expected_revision then raise exception 'design_changed' using errcode='22023';end if;
  next_revision:=coalesce(row_value.revision,0)+1;
  insert into public.event_invitation_designs(event_id,draft,revision) values(p_event_id,p_design,next_revision)
  on conflict(event_id) do update set draft=excluded.draft,revision=excluded.revision,updated_at=clock_timestamp();
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'invitation_design.saved',p_event_id,jsonb_build_object('revision',next_revision));
  return next_revision;
end;
$$;

create function public.publish_invitation_design(p_event_id uuid,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare row_value public.event_invitation_designs;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'event.update') then raise exception 'forbidden' using errcode='42501';end if;
  select * into row_value from public.event_invitation_designs where event_id=p_event_id for update;
  if row_value.id is null or row_value.revision is distinct from p_expected_revision then raise exception 'design_changed' using errcode='22023';end if;
  perform private.validate_invitation_design(row_value.draft);
  if nullif(btrim(row_value.draft->>'names'),'') is null or row_value.draft->'cover_asset_id'='null'::jsonb then raise exception 'design_incomplete' using errcode='22023';end if;
  if not exists(select 1 from public.events where id=p_event_id and status='active') then raise exception 'event_not_active' using errcode='22023';end if;
  if exists(select 1 from unnest(private.design_asset_ids(row_value.draft)) id where not exists(select 1 from public.event_invitation_assets a where a.id=id and a.event_id=p_event_id and a.status='ready')) then raise exception 'asset_unavailable' using errcode='22023';end if;
  if row_value.published_revision=row_value.revision then return;end if;
  update public.event_invitation_designs set published=draft,published_revision=revision,published_at=clock_timestamp(),updated_at=clock_timestamp() where id=row_value.id;
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'invitation_design.published',p_event_id,jsonb_build_object('revision',row_value.revision));
end;
$$;
create function public.unpublish_invitation_design(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'event.update') then raise exception 'forbidden' using errcode='42501';end if;
  update public.event_invitation_designs set published=null,published_at=null,published_revision=null,updated_at=clock_timestamp() where event_id=p_event_id;
  insert into public.audit_log(event_id,actor_id,action,target) values(p_event_id,auth.uid(),'invitation_design.unpublished',p_event_id);
end;
$$;

create function public.reserve_invitation_asset(p_event_id uuid,p_alt text)
returns uuid language plpgsql security definer set search_path='' as $$
declare asset_uuid uuid;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'content.write') then raise exception 'forbidden' using errcode='42501';end if;
  if p_alt is null or char_length(btrim(p_alt)) not between 1 and 240 or p_alt ~ '[a-fA-F0-9]{64}' then raise exception 'invalid_asset' using errcode='22023';end if;
  perform 1 from public.profiles where user_id=auth.uid() for update;
  if (select count(*) from public.event_invitation_assets where created_by=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'upload_limit' using errcode='P0001';end if;
  if (select count(*) from public.event_invitation_assets where event_id=p_event_id and status<>'deleted')>=20 then raise exception 'asset_limit' using errcode='P0001';end if;
  insert into public.event_invitation_assets(event_id,created_by,alt) values(p_event_id,auth.uid(),btrim(p_alt)) returning id into asset_uuid;
  return asset_uuid;
end;
$$;
-- Only the server can attest that WebP bytes passed validation and were stored.
create function public.complete_invitation_asset(p_asset_id uuid,p_width integer,p_height integer,p_bytes integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.event_invitation_assets set status='ready',width=p_width,height=p_height,bytes=p_bytes where id=p_asset_id and status='reserved';
end;
$$;

create function public.remove_invitation_asset(p_event_id uuid,p_asset_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'content.write') then raise exception 'forbidden' using errcode='42501';end if;
  if exists(select 1 from public.event_invitation_designs d where d.event_id=p_event_id and (p_asset_id=any(private.design_asset_ids(d.draft)) or p_asset_id=any(private.design_asset_ids(d.published)))) then raise exception 'asset_in_use' using errcode='22023';end if;
  update public.event_invitation_assets set status='deleted' where id=p_asset_id and event_id=p_event_id;
end;
$$;

create or replace function private.invitation_snapshot(p_guest public.guests,p_event public.events)
returns jsonb language sql volatile set search_path='' as $$
  select jsonb_build_object('ok',true,'server_time',clock_timestamp(),
    'event',jsonb_build_object('title',p_event.title,'type',p_event.type,'starts_at',p_event.starts_at,'timezone',p_event.timezone,'rsvp_deadline',p_event.rsvp_deadline,'session_closes_at',p_event.session_closes_at),
    'guest',jsonb_build_object('full_name',p_guest.full_name,'companions_allowed',p_guest.companions_allowed,'companions_confirmed',p_guest.companions_confirmed,'rsvp_status',p_guest.rsvp_status,'rsvp_at',p_guest.rsvp_at,'opted_out',p_guest.opted_out,'version',p_guest.rsvp_version),
    'can_respond',p_event.rsvp_deadline is null or clock_timestamp()<p_event.rsvp_deadline,
    'presentation',(select published from public.event_invitation_designs where event_id=p_event.id));
$$;

create function public.invitation_asset_manifest(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; event_uuid uuid; result jsonb;
begin
  -- Reuse ALL existing token/window/deletion/rate checks without recording an opening.
  snapshot:=public.guest_invitation(p_token,'{"action":"read"}');
  if not coalesce((snapshot->>'ok')::boolean,false) then return snapshot;end if;
  select event_id into event_uuid from public.guests where invite_token=p_token;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'alt',a.alt,'width',a.width,'height',a.height,'large_path',a.event_id::text||'/'||a.id::text||'/large.webp','small_path',a.event_id::text||'/'||a.id::text||'/small.webp')),'[]'::jsonb) into result
    from public.event_invitation_assets a where a.event_id=event_uuid and a.status='ready' and a.id=any(private.design_asset_ids(snapshot->'presentation'));
  return jsonb_build_object('ok',true,'assets',result,'closes_at',snapshot->'event'->'session_closes_at');
end;
$$;

revoke all on function private.design_asset_ids(jsonb),private.validate_invitation_design(jsonb),public.save_invitation_design(uuid,jsonb,integer),public.publish_invitation_design(uuid,integer),public.unpublish_invitation_design(uuid),public.reserve_invitation_asset(uuid,text),public.complete_invitation_asset(uuid,integer,integer,integer),public.remove_invitation_asset(uuid,uuid),public.invitation_asset_manifest(text) from public,anon,authenticated;
grant execute on function public.save_invitation_design(uuid,jsonb,integer),public.publish_invitation_design(uuid,integer),public.unpublish_invitation_design(uuid),public.reserve_invitation_asset(uuid,text),public.remove_invitation_asset(uuid,uuid) to authenticated;
grant execute on function public.complete_invitation_asset(uuid,integer,integer,integer) to service_role;
grant execute on function public.invitation_asset_manifest(text) to anon,authenticated;

commit;

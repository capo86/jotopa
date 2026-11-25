-- Bind every selected asset to its exact event; reject conflicting completion.
begin;
create or replace function private.validate_invitation_design(p_design jsonb)
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
  if (select count(distinct s->>'id') from jsonb_array_elements(p_design->'schedule') s)<>jsonb_array_length(p_design->'schedule') then raise exception 'invalid_design' using errcode='22023';end if;
  perform private.design_asset_ids(p_design);
exception when others then raise exception 'invalid_design' using errcode='22023';
end;
$$;

create or replace function public.save_invitation_design(p_event_id uuid,p_design jsonb,p_expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare row_value public.event_invitation_designs; next_revision integer;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'content.write') then raise exception 'forbidden' using errcode='42501';end if;
  perform private.validate_invitation_design(p_design);
  if exists(select 1 from unnest(private.design_asset_ids(p_design)) required(asset_id) where not exists(select 1 from public.event_invitation_assets a where a.id=required.asset_id and a.event_id=p_event_id and a.status='ready')) then raise exception 'asset_unavailable' using errcode='22023';end if;
  select * into row_value from public.event_invitation_designs where event_id=p_event_id for update;
  if p_expected_revision is null or coalesce(row_value.revision,0)<>p_expected_revision then raise exception 'design_changed' using errcode='22023';end if;
  next_revision:=coalesce(row_value.revision,0)+1;
  insert into public.event_invitation_designs(event_id,draft,revision) values(p_event_id,p_design,next_revision)
  on conflict(event_id) do update set draft=excluded.draft,revision=excluded.revision,updated_at=clock_timestamp();
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'invitation_design.saved',p_event_id,jsonb_build_object('revision',next_revision));
  return next_revision;
end;
$$;

create or replace function public.publish_invitation_design(p_event_id uuid,p_expected_revision integer)
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
  if exists(select 1 from unnest(private.design_asset_ids(row_value.draft)) required(asset_id) where not exists(select 1 from public.event_invitation_assets a where a.id=required.asset_id and a.event_id=p_event_id and a.status='ready')) then raise exception 'asset_unavailable' using errcode='22023';end if;
  if row_value.published_revision=row_value.revision then return;end if;
  update public.event_invitation_designs set published=draft,published_revision=revision,published_at=clock_timestamp(),updated_at=clock_timestamp() where id=row_value.id;
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'invitation_design.published',p_event_id,jsonb_build_object('revision',row_value.revision));
end;
$$;

create or replace function public.complete_invitation_asset(p_asset_id uuid,p_width integer,p_height integer,p_bytes integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.event_invitation_assets set status='ready',width=p_width,height=p_height,bytes=p_bytes where id=p_asset_id and status='reserved';
  if not found then raise exception 'asset_unavailable' using errcode='22023';end if;
  insert into public.audit_log(event_id,actor_id,action,target) select event_id,created_by,'invitation_asset.created',id from public.event_invitation_assets where id=p_asset_id;
end;
$$;
commit;

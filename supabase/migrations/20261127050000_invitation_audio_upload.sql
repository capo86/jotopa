begin;

create table public.invitation_audio_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  mime_type text not null check (mime_type in ('audio/mpeg','audio/mp4')),
  bytes integer not null check (bytes between 1 and 8388608),
  status text not null default 'reserved' check (status in ('reserved','ready')),
  created_at timestamptz not null default now()
);
create index invitation_audio_assets_event_idx on public.invitation_audio_assets(event_id,status);
create index invitation_audio_assets_creator_idx on public.invitation_audio_assets(created_by,created_at);
alter table public.invitation_audio_assets enable row level security;
revoke all on public.invitation_audio_assets from public,anon,authenticated;
grant select on public.invitation_audio_assets to authenticated;
create policy invitation_audio_editor_read on public.invitation_audio_assets
  for select to authenticated using (public.has_event_permission(event_id,'content.write'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('invitation-audio','invitation-audio',false,8388608,array['audio/mpeg','audio/mp4'])
on conflict (id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['audio/mpeg','audio/mp4'];

create function public.reserve_invitation_audio(p_event_id uuid,p_mime_type text,p_bytes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare asset_uuid uuid;
begin
  perform 1 from public.events where id=p_event_id and deleted_at is null for update;
  if not found or not public.has_event_permission(p_event_id,'content.write') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_mime_type not in ('audio/mpeg','audio/mp4') or p_bytes not between 1 and 8388608 then
    raise exception 'invalid_audio' using errcode='22023';
  end if;
  perform 1 from public.profiles where user_id=auth.uid() for update;
  if (select count(*) from public.invitation_audio_assets where created_by=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=8 then
    raise exception 'upload_limit' using errcode='P0001';
  end if;
  if (select count(*) from public.invitation_audio_assets where event_id=p_event_id)>=20 then
    raise exception 'asset_limit' using errcode='P0001';
  end if;
  insert into public.invitation_audio_assets(event_id,created_by,mime_type,bytes)
  values (p_event_id,auth.uid(),p_mime_type,p_bytes) returning id into asset_uuid;
  return asset_uuid;
end;
$$;
revoke all on function public.reserve_invitation_audio(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_invitation_audio(uuid,text,integer) to authenticated;

create function public.complete_invitation_audio(p_asset_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'forbidden' using errcode='42501';end if;
  update public.invitation_audio_assets set status='ready'
  where id=p_asset_id and status='reserved';
  if not found then raise exception 'asset_unavailable' using errcode='22023';end if;
end;
$$;
revoke all on function public.complete_invitation_audio(uuid) from public,anon,authenticated;
grant execute on function public.complete_invitation_audio(uuid) to service_role;

create function private.check_invitation_audio_asset()
returns trigger language plpgsql security definer set search_path='' as $$
declare design jsonb;
begin
  foreach design in array array[new.draft,new.published] loop
    if design is not null and design->>'music_asset_id' is not null
      and not exists (
        select 1 from public.invitation_audio_assets a
        where a.id=(design->>'music_asset_id')::uuid
          and a.event_id=new.event_id and a.status='ready'
      )
    then raise exception 'asset_unavailable' using errcode='22023';end if;
  end loop;
  return new;
end;
$$;
create trigger invitation_design_audio_asset_check
before insert or update of draft,published on public.event_invitation_designs
for each row execute function private.check_invitation_audio_asset();

create function public.invitation_audio_access(p_asset_id uuid,p_token text default null,p_slug text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare asset_row public.invitation_audio_assets; snapshot jsonb; closing timestamptz;
begin
  if (p_token is null)=(p_slug is null) then return null;end if;
  select * into asset_row from public.invitation_audio_assets
  where id=p_asset_id and status='ready';
  if asset_row.id is null then return null;end if;
  if p_token is not null then
    if p_token !~ '^[a-f0-9]{64}$' then return null;end if;
    snapshot:=public.guest_invitation(p_token,'{"action":"read"}');
    if coalesce((snapshot->>'ok')::boolean,false)=false
      or snapshot#>>'{presentation,music_asset_id}' is distinct from p_asset_id::text
      or not exists(select 1 from public.guests where invite_token=p_token and event_id=asset_row.event_id)
    then return null;end if;
    closing:=(snapshot#>>'{event,session_closes_at}')::timestamptz;
  else
    if not exists (
      select 1 from public.events e
      join public.event_invitation_designs d on d.event_id=e.id
      where e.id=asset_row.event_id and e.slug=p_slug and e.status='active'
        and e.deleted_at is null and clock_timestamp()>=e.session_opens_at
        and clock_timestamp()<e.session_closes_at and d.public_enabled
        and d.published->>'music_asset_id'=p_asset_id::text
    ) then return null;end if;
    select session_closes_at into closing from public.events where id=asset_row.event_id;
  end if;
  return jsonb_build_object(
    'path',asset_row.event_id::text||'/'||asset_row.id::text||
      case when asset_row.mime_type='audio/mpeg' then '.mp3' else '.m4a' end,
    'closes_at',closing
  );
end;
$$;
revoke all on function public.invitation_audio_access(uuid,text,text) from public,anon,authenticated;
grant execute on function public.invitation_audio_access(uuid,text,text) to anon,authenticated;

create or replace function private.validate_invitation_design(p_design jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare
  mix jsonb;
  extra jsonb;
  item jsonb;
  key_name text;
  validated jsonb;
begin
  if p_design ? 'palette_mix' then
    mix := p_design->'palette_mix';
    if p_design->>'version' <> '2'
      or jsonb_typeof(mix) <> 'array'
      or jsonb_array_length(mix) <> 3
      or exists (
        select 1 from jsonb_array_elements(mix) color
        where jsonb_typeof(color) <> 'number'
          or color::text !~ '^(0|[1-9][0-9]?)$|^100$'
      )
      or (select sum((color #>> '{}')::integer) from jsonb_array_elements(mix) color) <> 100
    then
      raise exception 'invalid_design' using errcode='22023';
    end if;
  end if;

  if p_design ? 'cover_quote' then
    if p_design->>'version' <> '2'
      or jsonb_typeof(p_design->'cover_quote') <> 'string'
      or private.invitation_text_length(p_design->>'cover_quote') > 180
    then
      raise exception 'invalid_design' using errcode='22023';
    end if;
  end if;

  if p_design ? 'cover_quote_title' then
    if p_design->>'version' <> '2'
      or jsonb_typeof(p_design->'cover_quote_title') <> 'string'
      or private.invitation_text_length(p_design->>'cover_quote_title') > 80
    then
      raise exception 'invalid_design' using errcode='22023';
    end if;
  end if;

  if p_design ? 'cover_quote_signature' then
    if p_design->>'version' <> '2'
      or jsonb_typeof(p_design->'cover_quote_signature') <> 'string'
      or private.invitation_text_length(p_design->>'cover_quote_signature') > 100
    then
      raise exception 'invalid_design' using errcode='22023';
    end if;
  end if;

  if p_design ? 'gallery_style' then
    if p_design->>'version' <> '2'
      or p_design->>'gallery_style' not in ('collage', 'floating')
    then
      raise exception 'invalid_design' using errcode='22023';
    end if;
  end if;

  if p_design ? 'gallery_ken_burns' then
    if p_design->>'version' <> '2'
      or jsonb_typeof(p_design->'gallery_ken_burns') <> 'boolean'
    then
      raise exception 'invalid_design' using errcode='22023';
    end if;
  end if;

  if octet_length(p_design::text) > 64000 then
    raise exception 'invalid_design' using errcode='22023';
  end if;

  extra := p_design #> '{gifts,banking_extra}';
  if extra is not null then
    if jsonb_typeof(extra) <> 'array' or jsonb_array_length(extra) > 4 then
      raise exception 'invalid_design' using errcode='22023';
    end if;
    for item in select value from jsonb_array_elements(extra) value loop
      perform private.check_invitation_object(item,array['enabled','bank_name','holder','account','alias','notes']);
      if jsonb_typeof(item->'enabled') <> 'boolean' then
        raise exception 'invalid_design' using errcode='22023';
      end if;
      foreach key_name in array array['bank_name','holder','account','alias','notes'] loop
        perform private.check_invitation_string(item,key_name,
          case key_name when 'notes' then 600 when 'holder' then 160 when 'account' then 160 else 120 end);
      end loop;
      if item->'enabled' = 'true'::jsonb
        and (btrim(item->>'holder') = '' or (btrim(item->>'account') = '' and btrim(item->>'alias') = ''))
      then
        raise exception 'invalid_design' using errcode='22023';
      end if;
    end loop;
  end if;

  if p_design ? 'music_asset_id' then
    if p_design->>'version'<>'2'
      or (jsonb_typeof(p_design->'music_asset_id') not in ('null','string'))
      or (jsonb_typeof(p_design->'music_asset_id')='string'
        and p_design->>'music_asset_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    then raise exception 'invalid_design' using errcode='22023';end if;
  end if;
  validated := p_design - 'palette_mix' - 'cover_quote' - 'cover_quote_title' - 'cover_quote_signature' - 'gallery_style' - 'gallery_ken_burns' - 'music_asset_id';
  validated := jsonb_set(validated,'{gifts}',(validated->'gifts') - 'banking_extra');
  perform private.validate_invitation_design_without_palette_mix(validated);
exception when others then
  raise exception 'invalid_design' using errcode='22023';
end;
$$;

commit;
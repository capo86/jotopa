begin;

create function private.validate_invitation_design_v1(p_design jsonb)
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
    if private.invitation_text_length(value)>(case key_name when 'names' then 160 when 'eyebrow' then 80 when 'closing' then 600 when 'dress_code' then 300 else 1600 end) then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  if p_design->'cover_asset_id'<>'null'::jsonb and (jsonb_typeof(p_design->'cover_asset_id')<>'string' or p_design->>'cover_asset_id' !~ '^[a-f0-9-]{36}$') then raise exception 'invalid_design' using errcode='22023';end if;
  if (select count(distinct s->>'id') from jsonb_array_elements(p_design->'sections') s)<>8 then raise exception 'invalid_design' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_design->'sections') loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2 or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','enabled')) or coalesce(item->>'id','') not in ('welcome','countdown','schedule','dress','gallery','details','rsvp','closing') or jsonb_typeof(item->'enabled')<>'boolean' then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  for item in select * from jsonb_array_elements(p_design->'gallery') loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2 or exists(select 1 from jsonb_object_keys(item) k where k not in ('asset_id','caption')) or jsonb_typeof(item->'asset_id')<>'string' or item->>'asset_id' !~ '^[a-f0-9-]{36}$' or jsonb_typeof(item->'caption')<>'string' or private.invitation_text_length(item->>'caption')>240 then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  if (select count(distinct g->>'asset_id') from jsonb_array_elements(p_design->'gallery') g)<>jsonb_array_length(p_design->'gallery') then raise exception 'invalid_design' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_design->'schedule') loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>7
      or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','label','venue','address','starts_at','latitude','longitude'))
      or jsonb_typeof(item->'id')<>'string' or item->>'id' !~ '^[a-f0-9-]{36}$' or jsonb_typeof(item->'label')<>'string' or private.invitation_text_length(btrim(item->>'label')) not between 1 and 80
      or jsonb_typeof(item->'venue')<>'string' or private.invitation_text_length(item->>'venue')>160
      or jsonb_typeof(item->'address')<>'string' or private.invitation_text_length(item->>'address')>300
      or jsonb_typeof(item->'starts_at')<>'string' or item->>'starts_at' !~ '^\d{4}-\d{2}-\d{2}T.*Z$'
      or (item->'latitude'<>'null'::jsonb and (jsonb_typeof(item->'latitude')<>'number' or (item->>'latitude')::numeric not between -90 and 90))
      or (item->'longitude'<>'null'::jsonb and (jsonb_typeof(item->'longitude')<>'number' or (item->>'longitude')::numeric not between -180 and 180))
      or ((item->'latitude'='null'::jsonb)<>(item->'longitude'='null'::jsonb))
      then raise exception 'invalid_design' using errcode='22023';end if;
    perform (item->>'starts_at')::timestamptz;
  end loop;
  if (select count(distinct s->>'id') from jsonb_array_elements(p_design->'schedule') s)<>jsonb_array_length(p_design->'schedule') then raise exception 'invalid_design' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_design->'schedule') loop
    if item->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      or item->>'starts_at' !~ '^\d{4}-\d{2}-\d{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.\d{1,9})?Z$'
      then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  perform private.design_asset_ids(p_design);
exception when others then raise exception 'invalid_design' using errcode='22023';
end;
$$;

create function private.invitation_link_allowed(p_value text,p_kind text default 'external')
returns boolean language plpgsql immutable set search_path='' as $$
declare parts text[];host text;path text;
begin
  if p_value='' then return true;end if;
  if p_value is null or char_length(p_value)>1000 or p_value ~ '[^\x21-\x7e]' or position(E'\\' in p_value)>0 then return false;end if;
  parts:=regexp_match(p_value,'^https://([^/?#]+)([^?#]*)([?#].*)?$');
  if parts is null then return false;end if;
  host:=lower(parts[1]);path:=parts[2];
  if host !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(:443)?$' or path ~* '(^|/)(\.|%2e){1,2}(/|[?#]|$)' then return false;end if;
  host:=regexp_replace(host,':443$','');
  if p_kind='maps' then return host in ('maps.app.goo.gl','maps.google.com') or (host in ('google.com','www.google.com','goo.gl') and path ~ '^/maps(/|$)');end if;
  if p_kind='waze' then return host in ('waze.com','www.waze.com') and path ~ '^/(ul|live-map)(/|$)';end if;
  return p_kind='external';
end;
$$;

create function private.check_invitation_object(p_value jsonb,p_keys text[])
returns void language plpgsql immutable set search_path='' as $$
begin
  if p_value is null or jsonb_typeof(p_value)<>'object' then raise exception 'invalid_design' using errcode='22023';end if;
  if (select count(*) from jsonb_object_keys(p_value))<>cardinality(p_keys) or exists(select 1 from jsonb_object_keys(p_value) k where not(k=any(p_keys))) then raise exception 'invalid_design' using errcode='22023';end if;
end;
$$;
create function private.check_invitation_string(p_value jsonb,p_key text,p_max integer,p_required boolean default false)
returns void language plpgsql immutable set search_path='' as $$
begin
  if coalesce(jsonb_typeof(p_value->p_key),'')<>'string' or private.invitation_text_length(p_value->>p_key)>p_max or (p_required and btrim(p_value->>p_key)='') then raise exception 'invalid_design' using errcode='22023';end if;
end;
$$;
create function private.check_invitation_photo(p_value jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if p_value='null'::jsonb then return;end if;
  if coalesce(jsonb_typeof(p_value),'')<>'string' or p_value#>>'{}' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then raise exception 'invalid_design' using errcode='22023';end if;
end;
$$;

create or replace function private.design_asset_ids(p_design jsonb)
returns uuid[] language sql immutable set search_path='' as $$
  select coalesce(array_agg(distinct id),'{}'::uuid[]) from (
    select nullif(p_design->>'cover_asset_id','')::uuid id
    union all select (g->>'asset_id')::uuid from jsonb_array_elements(coalesce(p_design->'gallery','[]'::jsonb)) g
    union all select (s->>'photo_asset_id')::uuid from jsonb_array_elements(coalesce(p_design->'schedule','[]'::jsonb)) s
    union all select (s->>'photo_asset_id')::uuid from jsonb_array_elements(coalesce(p_design->'lodging','[]'::jsonb)) s
    union all select (p_design->>'dress_photo_asset_id')::uuid
  ) source where id is not null;
$$;

create or replace function private.validate_invitation_design(p_design jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare legacy jsonb;item jsonb;key_name text;banking jsonb;gifts jsonb;
begin
  if p_design->'version'='1'::jsonb then perform private.validate_invitation_design_v1(p_design);return;end if;
  perform private.check_invitation_object(p_design,array['version','template','palette','font_pair','names','eyebrow','welcome','show_guest_name','closing','dress_code','details','cover_asset_id','cover_focus','gallery','schedule','sections','gifts','lodging','dress_photo_asset_id']);
  if p_design->'version' is distinct from '2'::jsonb or octet_length(p_design::text)>64000 or p_design::text ~ '[a-fA-F0-9]{64}'
    or jsonb_typeof(p_design->'sections')<>'array' or jsonb_array_length(p_design->'sections')<>10
    or jsonb_typeof(p_design->'schedule')<>'array' or jsonb_array_length(p_design->'schedule')>4
    or jsonb_typeof(p_design->'lodging')<>'array' or jsonb_array_length(p_design->'lodging')>6
    then raise exception 'invalid_design' using errcode='22023';end if;
  if (select count(distinct s->>'id') from jsonb_array_elements(p_design->'sections') s)<>10 then raise exception 'invalid_design' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_design->'sections') loop
    perform private.check_invitation_object(item,array['id','enabled']);
    if coalesce(item->>'id','') not in ('welcome','countdown','schedule','dress','gallery','details','gifts','lodging','rsvp','closing') or jsonb_typeof(item->'enabled')<>'boolean' then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  legacy:=(p_design-'gifts'-'lodging'-'dress_photo_asset_id')||jsonb_build_object('version',1,
    'schedule',(select coalesce(jsonb_agg(s-'kind'-'enabled'-'description'-'photo_asset_id'-'google_maps_url'-'waze_url'),'[]'::jsonb) from jsonb_array_elements(p_design->'schedule') s),
    'sections',(select jsonb_agg(s) from jsonb_array_elements(p_design->'sections') s where s->>'id' not in ('gifts','lodging')));
  perform private.validate_invitation_design_v1(legacy);
  perform private.check_invitation_photo(p_design->'dress_photo_asset_id');
  for item in select * from jsonb_array_elements(p_design->'schedule') loop
    perform private.check_invitation_object(item,array['id','label','venue','address','starts_at','latitude','longitude','kind','enabled','description','photo_asset_id','google_maps_url','waze_url']);
    if coalesce(item->>'kind','') not in ('ceremony','reception','other') or jsonb_typeof(item->'enabled')<>'boolean' then raise exception 'invalid_design' using errcode='22023';end if;
    perform private.check_invitation_string(item,'description',800);
    perform private.check_invitation_photo(item->'photo_asset_id');
    foreach key_name in array array['google_maps_url','waze_url'] loop
      perform private.check_invitation_string(item,key_name,1000);
      if not private.invitation_link_allowed(item->>key_name,case when key_name='google_maps_url' then 'maps' else 'waze' end) then raise exception 'invalid_design' using errcode='22023';end if;
    end loop;
  end loop;
  gifts:=p_design->'gifts';
  perform private.check_invitation_object(gifts,array['message','items','banking']);
  perform private.check_invitation_string(gifts,'message',1200);
  if jsonb_typeof(gifts->'items')<>'array' or jsonb_array_length(gifts->'items')>12 then raise exception 'invalid_design' using errcode='22023';end if;
  if (select count(distinct i->>'id') from jsonb_array_elements(gifts->'items') i)<>jsonb_array_length(gifts->'items') then raise exception 'invalid_design' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(gifts->'items') loop
    perform private.check_invitation_object(item,array['id','name','description','url','enabled']);
    if jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'enabled')<>'boolean' then raise exception 'invalid_design' using errcode='22023';end if;
    perform private.check_invitation_photo(item->'id');
    perform private.check_invitation_string(item,'name',120,true);
    perform private.check_invitation_string(item,'description',600);
    perform private.check_invitation_string(item,'url',1000);
    if not private.invitation_link_allowed(item->>'url') then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  banking:=gifts->'banking';
  perform private.check_invitation_object(banking,array['enabled','bank_name','holder','account','alias','notes']);
  if jsonb_typeof(banking->'enabled')<>'boolean' then raise exception 'invalid_design' using errcode='22023';end if;
  foreach key_name in array array['bank_name','holder','account','alias','notes'] loop
    perform private.check_invitation_string(banking,key_name,case key_name when 'notes' then 600 when 'holder' then 160 when 'account' then 160 else 120 end);
  end loop;
  if banking->'enabled'='true'::jsonb and (btrim(banking->>'holder')='' or (btrim(banking->>'account')='' and btrim(banking->>'alias')='')) then raise exception 'invalid_design' using errcode='22023';end if;
  if (select count(distinct i->>'id') from jsonb_array_elements(p_design->'lodging') i)<>jsonb_array_length(p_design->'lodging') then raise exception 'invalid_design' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_design->'lodging') loop
    perform private.check_invitation_object(item,array['id','name','photo_asset_id','address','description','phone','whatsapp','booking_url','google_maps_url','waze_url','latitude','longitude','enabled']);
    if jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'enabled')<>'boolean' then raise exception 'invalid_design' using errcode='22023';end if;
    perform private.check_invitation_photo(item->'id');perform private.check_invitation_photo(item->'photo_asset_id');
    perform private.check_invitation_string(item,'name',120,true);perform private.check_invitation_string(item,'address',300);perform private.check_invitation_string(item,'description',800);
    foreach key_name in array array['phone','whatsapp'] loop
      perform private.check_invitation_string(item,key_name,16);
      if item->>key_name<>'' and not public.is_valid_guest_phone(item->>key_name) then raise exception 'invalid_design' using errcode='22023';end if;
    end loop;
    foreach key_name in array array['booking_url','google_maps_url','waze_url'] loop
      perform private.check_invitation_string(item,key_name,1000);
      if not private.invitation_link_allowed(item->>key_name,case key_name when 'google_maps_url' then 'maps' when 'waze_url' then 'waze' else 'external' end) then raise exception 'invalid_design' using errcode='22023';end if;
    end loop;
    if (item->'latitude'<>'null'::jsonb and (jsonb_typeof(item->'latitude')<>'number' or (item->>'latitude')::numeric not between -90 and 90))
      or (item->'longitude'<>'null'::jsonb and (jsonb_typeof(item->'longitude')<>'number' or (item->>'longitude')::numeric not between -180 and 180))
      or ((item->'latitude'='null'::jsonb)<>(item->'longitude'='null'::jsonb)) then raise exception 'invalid_design' using errcode='22023';end if;
  end loop;
  perform private.design_asset_ids(p_design);
exception when others then raise exception 'invalid_design' using errcode='22023';
end;
$$;

create or replace function private.public_invitation_design(p_event_id uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare design jsonb;result jsonb;gifts jsonb;banking jsonb;empty_banking jsonb:='{"enabled":false,"bank_name":"","holder":"","account":"","alias":"","notes":""}';
begin
  select published into design from public.event_invitation_designs where event_id=p_event_id;
  if design is null then return null;end if;
  result:=design||jsonb_build_object(
    'welcome',case when private.invitation_section_enabled(design,'welcome') then design->>'welcome' else '' end,
    'dress_code',case when private.invitation_section_enabled(design,'dress') then design->>'dress_code' else '' end,
    'details',case when private.invitation_section_enabled(design,'details') then design->>'details' else '' end,
    'closing',case when private.invitation_section_enabled(design,'closing') then design->>'closing' else '' end,
    'gallery',case when private.invitation_section_enabled(design,'gallery') then design->'gallery' else '[]'::jsonb end,
    'schedule',case when private.invitation_section_enabled(design,'schedule') then (select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(design->'schedule') item where design->'version'='1'::jsonb or item->'enabled'='true'::jsonb) else '[]'::jsonb end);
  if design->'version'='1'::jsonb then return result;end if;
  gifts:=design->'gifts';banking:=gifts->'banking';
  if not private.invitation_section_enabled(design,'gifts') then gifts:=jsonb_build_object('message','','items','[]'::jsonb,'banking',empty_banking);
  else gifts:=gifts||jsonb_build_object('items',(select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(gifts->'items') item where item->'enabled'='true'::jsonb),'banking',case when banking->'enabled'='true'::jsonb then banking else empty_banking end);end if;
  return result||jsonb_build_object('gifts',gifts,
    'lodging',case when private.invitation_section_enabled(design,'lodging') then (select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(design->'lodging') item where item->'enabled'='true'::jsonb) else '[]'::jsonb end,
    'dress_photo_asset_id',case when private.invitation_section_enabled(design,'dress') then design->'dress_photo_asset_id' else 'null'::jsonb end);
end;
$$;

revoke all on function private.validate_invitation_design_v1(jsonb),private.invitation_link_allowed(text,text),private.check_invitation_object(jsonb,text[]),private.check_invitation_string(jsonb,text,integer,boolean),private.check_invitation_photo(jsonb) from public,anon,authenticated;
commit;

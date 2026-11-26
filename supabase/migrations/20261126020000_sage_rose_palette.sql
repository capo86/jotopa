begin;
create or replace function private.validate_invitation_design_v1(p_design jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare item jsonb; value text; key_name text;
begin
  if p_design is null or jsonb_typeof(p_design)<>'object' or octet_length(p_design::text)>24000 or p_design::text ~ '[a-fA-F0-9]{64}'
    or exists(select 1 from jsonb_object_keys(p_design) k where k not in ('version','template','palette','font_pair','names','eyebrow','welcome','show_guest_name','closing','dress_code','details','cover_asset_id','cover_focus','gallery','schedule','sections'))
    or (select count(*) from jsonb_object_keys(p_design))<>16
    or p_design->>'version' is distinct from '1'
    or coalesce(p_design->>'template','') not in ('romantic','festive','minimal')
    or coalesce(p_design->>'palette','') not in ('olive','rose','night','sage_rose')
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
commit;

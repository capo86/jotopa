begin;
create or replace function private.validate_invitation_design(p_design jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare legacy jsonb;item jsonb;key_name text;banking jsonb;gifts jsonb;
begin
  if p_design->'version'='1'::jsonb then perform private.validate_invitation_design_v1(p_design);return;end if;
  perform private.check_invitation_object(p_design,array['version','template','palette','font_pair','names','eyebrow','welcome','show_guest_name','closing','dress_code','details','cover_asset_id','cover_focus','gallery','schedule','sections','gifts','lodging','dress_photo_asset_id']||case when p_design ? 'music_url' then array['music_url'] else array[]::text[] end);
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
  if p_design ? 'music_url' then
    perform private.check_invitation_string(p_design,'music_url',1000);
    if not private.invitation_link_allowed(p_design->>'music_url') or (p_design->>'music_url'<>'' and p_design->>'music_url' !~* '^https://[^?#]+\.(mp3|m4a|aac|ogg|opus|wav|webm)([?#].*)?$') then raise exception 'invalid_design' using errcode='22023';end if;
  end if;
  legacy:=(p_design-'gifts'-'lodging'-'dress_photo_asset_id'-'music_url')||jsonb_build_object('version',1,
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
commit;

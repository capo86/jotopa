begin;

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

  validated := p_design - 'palette_mix' - 'cover_quote' - 'cover_quote_title' - 'cover_quote_signature' - 'gallery_style' - 'gallery_ken_burns';
  validated := jsonb_set(validated,'{gifts}',(validated->'gifts') - 'banking_extra');
  perform private.validate_invitation_design_without_palette_mix(validated);
exception when others then
  raise exception 'invalid_design' using errcode='22023';
end;
$;

create or replace function private.public_invitation_design(input jsonb)
returns jsonb language plpgsql immutable set search_path='' as 
declare output jsonb:=input; section text;
begin
  for section in select s->>'id' from jsonb_array_elements(input->'sections') s where coalesce((s->>'enabled')::boolean,false)=false loop
    case section
      when 'welcome' then output:=jsonb_set(output,'{welcome}','""');
      when 'dress' then output:=jsonb_set(output,'{dress_code}','""'); if output->>'version'='2' then output:=jsonb_set(output,'{dress_photo_asset_id}','null'); end if;
      when 'gallery' then output:=jsonb_set(output,'{gallery}','[]');
      when 'schedule' then output:=jsonb_set(output,'{schedule}','[]');
      when 'details' then output:=jsonb_set(output,'{details}','""');
      when 'closing' then output:=jsonb_set(output,'{closing}','""');
      when 'gifts' then if output->>'version'='2' then output:=jsonb_set(output,'{gifts}',jsonb_build_object('message','','items','[]'::jsonb,'banking',jsonb_build_object('enabled',false,'bank_name','','holder','','account','','alias','','notes',''),'banking_extra','[]'::jsonb)); end if;
      when 'lodging' then if output->>'version'='2' then output:=jsonb_set(output,'{lodging}','[]'); end if;
      else null;
    end case;
  end loop;
  if output->>'version'='2' and not coalesce((output#>>'{gifts,banking,enabled}')::boolean,false) then
    output:=jsonb_set(output,'{gifts,banking}',jsonb_build_object('enabled',false,'bank_name','','holder','','account','','alias','','notes',''));
  end if;
  if output->>'version'='2' then
    output:=jsonb_set(output,'{schedule}',coalesce((select jsonb_agg(item) from jsonb_array_elements(output->'schedule') item where coalesce((item->>'enabled')::boolean,false)),'[]'::jsonb));
    output:=jsonb_set(output,'{lodging}',coalesce((select jsonb_agg(item) from jsonb_array_elements(output->'lodging') item where coalesce((item->>'enabled')::boolean,false)),'[]'::jsonb));
    output:=jsonb_set(output,'{gifts,items}',coalesce((select jsonb_agg(item) from jsonb_array_elements(output#>'{gifts,items}') item where coalesce((item->>'enabled')::boolean,false)),'[]'::jsonb));
    output:=jsonb_set(output,'{gifts,banking_extra}',coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(output#>'{gifts,banking_extra}','[]'::jsonb)) item where coalesce((item->>'enabled')::boolean,false)),'[]'::jsonb));
  end if;
  return output;
end;
;

create or replace function private.public_invitation_design(p_event_id uuid)
returns jsonb language plpgsql stable set search_path='' as 
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
  if not private.invitation_section_enabled(design,'gifts') then gifts:=jsonb_build_object('message','','items','[]'::jsonb,'banking',empty_banking,'banking_extra','[]'::jsonb);
  else gifts:=gifts||jsonb_build_object('items',(select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(gifts->'items') item where item->'enabled'='true'::jsonb),'banking',case when banking->'enabled'='true'::jsonb then banking else empty_banking end,'banking_extra',(select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(coalesce(gifts->'banking_extra','[]'::jsonb)) item where item->'enabled'='true'::jsonb));end if;
  return result||jsonb_build_object('gifts',gifts,
    'lodging',case when private.invitation_section_enabled(design,'lodging') then (select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(design->'lodging') item where item->'enabled'='true'::jsonb) else '[]'::jsonb end,
    'dress_photo_asset_id',case when private.invitation_section_enabled(design,'dress') then design->'dress_photo_asset_id' else 'null'::jsonb end);
end;
;

commit;

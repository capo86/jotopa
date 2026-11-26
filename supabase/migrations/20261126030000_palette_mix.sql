begin;

alter function private.validate_invitation_design(jsonb) rename to validate_invitation_design_without_palette_mix;

create function private.validate_invitation_design(p_design jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare
  mix jsonb;
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
  perform private.validate_invitation_design_without_palette_mix(p_design - 'palette_mix');
exception when others then
  raise exception 'invalid_design' using errcode='22023';
end;
$$;

commit;


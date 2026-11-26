begin;
create or replace function private.public_invitation_design(input jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
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
      when 'gifts' then if output->>'version'='2' then output:=jsonb_set(output,'{gifts}',jsonb_build_object('message','','items','[]'::jsonb,'banking',jsonb_build_object('enabled',false,'bank_name','','holder','','account','','alias','','notes',''))); end if;
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
  end if;
  return output;
end;
$$;
commit;

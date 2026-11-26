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
revoke all on function private.public_invitation_design(jsonb) from public,anon,authenticated;

create or replace function public.public_invitation(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('event',jsonb_build_object('title',e.title,'starts_at',e.starts_at,'timezone',e.timezone,'rsvp_deadline',e.rsvp_deadline),
    'design',p.design,
    'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'alt',a.alt,'width',a.width,'height',a.height,'large_path',a.event_id||'/'||a.id||'/large.webp','small_path',a.event_id||'/'||a.id||'/small.webp')) from public.event_invitation_assets a where a.event_id=e.id and a.status='ready' and a.id=any(private.design_asset_ids(p.design))),'[]'::jsonb))
  from public.events e join public.event_invitation_designs d on d.event_id=e.id
  cross join lateral (select private.public_invitation_design(d.published) design) p
  where e.slug=p_slug and e.deleted_at is null and e.status in ('draft','active') and d.published is not null and d.public_enabled
    and length(p_slug) between 1 and 100 limit 1;
$$;
commit;

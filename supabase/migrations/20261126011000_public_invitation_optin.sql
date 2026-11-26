begin;

alter table public.event_invitation_designs add column public_enabled boolean not null default false;


create or replace function public.publish_invitation_design(p_event_id uuid,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare row_value public.event_invitation_designs;
begin
  perform 1 from public.events where id=p_event_id and deleted_at is null for update;
  if not found or not public.has_event_permission(p_event_id,'event.update') then raise exception 'forbidden' using errcode='42501';end if;
  select * into row_value from public.event_invitation_designs where event_id=p_event_id for update;
  if row_value.id is null or row_value.revision is distinct from p_expected_revision then raise exception 'design_changed' using errcode='22023';end if;
  perform private.validate_invitation_design(row_value.draft);
  if nullif(btrim(row_value.draft->>'names'),'') is null or row_value.draft->'cover_asset_id'='null'::jsonb then raise exception 'design_incomplete' using errcode='22023';end if;
  if exists(select 1 from unnest(private.design_asset_ids(row_value.draft)) required(asset_id) where not exists(select 1 from public.event_invitation_assets a where a.id=required.asset_id and a.event_id=p_event_id and a.status='ready')) then raise exception 'asset_unavailable' using errcode='22023';end if;
  if row_value.published_revision=row_value.revision and row_value.public_enabled then return;end if;
  update public.event_invitation_designs set published=draft,published_revision=revision,published_at=clock_timestamp(),updated_at=clock_timestamp(),public_enabled=true where id=row_value.id;
  insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'invitation_design.published',p_event_id,jsonb_build_object('revision',row_value.revision));
end;
$$;

create or replace function public.public_invitation(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
  select null::jsonb;
$$;
revoke all on function public.public_invitation(text) from public;
grant execute on function public.public_invitation(text) to anon,authenticated;
commit;

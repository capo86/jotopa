begin;
create or replace function private.wall_notify_access_change() returns trigger language plpgsql security definer set search_path='' as $$
declare event_uuid uuid:=coalesce(new.event_id,old.event_id);issuer_uuid uuid;
begin
  if not exists(select 1 from public.events where id=event_uuid and deleted_at is null) then return null;end if;
  if tg_table_name='event_members' and tg_op in ('UPDATE','DELETE') then
    issuer_uuid:=old.user_id;
    if not exists(select 1 from public.event_members m where m.event_id=event_uuid and m.user_id=issuer_uuid and 'wall.moderate'=any(public.event_role_permissions(m.role)))
      and not exists(select 1 from public.profiles where user_id=issuer_uuid and platform_role='super_admin') then
      update private.wall_projection_access set revoked_at=clock_timestamp() where event_id=event_uuid and issued_by=issuer_uuid and revoked_at is null;
      if found then insert into public.audit_log(event_id,actor_id,action,target,meta) values(event_uuid,auth.uid(),'wall.projection_revoked',event_uuid,'{"reason":"issuer_access_removed"}');end if;
    end if;
  end if;
  perform private.wall_notify(event_uuid);return null;
end;
$$;
commit;

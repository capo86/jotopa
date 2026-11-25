begin;

-- An administrative demotion must not leave a dormant credential that becomes
-- usable again if the platform role is restored later. Event moderators keep
-- their independently authorized access.
create function private.wall_revoke_projection_on_platform_demotion() returns trigger
language plpgsql security definer set search_path='' as $$
declare revoked_event uuid;
begin
  if old.platform_role='super_admin' and new.platform_role<>'super_admin' then
    for revoked_event in
      update private.wall_projection_access a set revoked_at=clock_timestamp()
      where a.issued_by=new.user_id and a.revoked_at is null
        and not exists(select 1 from public.event_members m where m.event_id=a.event_id and m.user_id=new.user_id
          and 'wall.moderate'=any(public.event_role_permissions(m.role)))
      returning a.event_id
    loop
      insert into public.audit_log(event_id,actor_id,action,target,meta)
      values(revoked_event,auth.uid(),'wall.projection_revoked',revoked_event,'{"reason":"platform_access_removed"}');
      perform private.wall_notify(revoked_event);
    end loop;
  end if;
  return null;
end;
$$;
create trigger wall_projection_platform_demotion after update of platform_role on public.profiles
for each row execute function private.wall_revoke_projection_on_platform_demotion();
revoke all on function private.wall_revoke_projection_on_platform_demotion() from public,anon,authenticated;

commit;

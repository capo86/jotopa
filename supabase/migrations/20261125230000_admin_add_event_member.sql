-- Only a platform administrator may attach an existing account to an event.
-- The existing audit trigger records the authenticated actor and assigned role.
begin;
create function public.admin_add_event_member(p_event_id uuid, p_user_id uuid, p_role public.event_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where user_id = (select auth.uid()) and platform_role = 'super_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists(select 1 from public.events where id = p_event_id and deleted_at is null) then
    raise exception 'event_unavailable' using errcode = 'P0001';
  end if;
  if not exists(select 1 from public.profiles where user_id = p_user_id and platform_role = 'organizer') then
    raise exception 'user_unavailable' using errcode = 'P0001';
  end if;
  insert into public.event_members(event_id,user_id,role) values(p_event_id,p_user_id,p_role);
end;
$$;
revoke all on function public.admin_add_event_member(uuid,uuid,public.event_role) from public,anon,authenticated;
grant execute on function public.admin_add_event_member(uuid,uuid,public.event_role) to authenticated;
commit;

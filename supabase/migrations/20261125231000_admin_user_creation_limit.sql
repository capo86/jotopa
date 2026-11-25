begin;
create table private.admin_user_creation_limits (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0)
);
alter table private.admin_user_creation_limits enable row level security;
revoke all on private.admin_user_creation_limits from public,anon,authenticated;
create function public.reserve_admin_user_creation()
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if not exists(select 1 from public.profiles where user_id = (select auth.uid()) and platform_role = 'super_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into private.admin_user_creation_limits(actor_id,window_start,attempts)
  values((select auth.uid()),clock_timestamp(),1)
  on conflict(actor_id) do update set
    attempts=case when private.admin_user_creation_limits.window_start < clock_timestamp()-interval '1 hour' then 1 else private.admin_user_creation_limits.attempts+1 end,
    window_start=case when private.admin_user_creation_limits.window_start < clock_timestamp()-interval '1 hour' then clock_timestamp() else private.admin_user_creation_limits.window_start end
  returning attempts<=20 into allowed;
  return allowed;
end;
$$;
revoke all on function public.reserve_admin_user_creation() from public,anon,authenticated;
grant execute on function public.reserve_admin_user_creation() to authenticated;
commit;

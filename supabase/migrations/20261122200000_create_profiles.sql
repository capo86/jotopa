-- Phase 1A: platform identity. Event permissions belong to phase 1B.
begin;

create type public.platform_role as enum ('organizer', 'super_admin');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  platform_role public.platform_role not null default 'organizer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- RLS controls rows; column grants prevent editing role, identity and timestamps.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, platform_role)
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120),
    'organizer'
  );
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_profile_updated_at() from public, anon, authenticated;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.touch_profile_updated_at();

-- Existing Auth users also receive a profile, never a role from user metadata.
insert into public.profiles (user_id, full_name, platform_role)
select id, left(btrim(coalesce(raw_user_meta_data ->> 'full_name', '')), 120), 'organizer'
from auth.users
on conflict (user_id) do nothing;

comment on column public.profiles.platform_role is
  'Trusted database administration only. Public signup always creates organizer; metadata is not an authorization source.';

commit;

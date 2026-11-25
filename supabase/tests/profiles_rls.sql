-- Transactional fixtures: these users and all changes are rolled back.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', 'rls-one@example.test', '{"full_name":"RLS one","platform_role":"super_admin"}'),
  ('10000000-0000-4000-8000-000000000002', 'rls-two@example.test', '{"full_name":"RLS two"}');

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then raise exception 'RLS is not enabled'; end if;
  if (select platform_role from public.profiles where user_id = '10000000-0000-4000-8000-000000000001') <> 'organizer' then raise exception 'Untrusted signup role was used'; end if;
end $$;

set local role anon;
do $$ begin
  begin perform * from public.profiles; raise exception 'Anonymous read unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
end $$;

do $$ declare affected integer; begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Foreign profiles are visible'; end if;
  update public.profiles set full_name = 'Own edit' where user_id = '10000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own profile cannot be updated'; end if;
  update public.profiles set full_name = 'Forbidden' where user_id = '10000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign profile changed'; end if;
  begin update public.profiles set platform_role = 'super_admin'; raise exception 'Role update allowed'; exception when insufficient_privilege then null; end;
  begin update public.profiles set user_id = '10000000-0000-4000-8000-000000000003'; raise exception 'Identity update allowed'; exception when insufficient_privilege then null; end;
  begin update public.profiles set id = gen_random_uuid(); raise exception 'ID update allowed'; exception when insufficient_privilege then null; end;
  begin update public.profiles set created_at = now(); raise exception 'Creation timestamp update allowed'; exception when insufficient_privilege then null; end;
  begin update public.profiles set updated_at = now(); raise exception 'Update timestamp update allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.profiles(user_id) values ('10000000-0000-4000-8000-000000000003'); raise exception 'Insert allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.profiles; raise exception 'Delete allowed'; exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
  if (select full_name from public.profiles where user_id = '10000000-0000-4000-8000-000000000002') <> 'RLS two' then raise exception 'Foreign data changed'; end if;
end $$;

update public.profiles set platform_role = 'super_admin' where user_id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Platform role bypassed profile isolation'; end if;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  if (select count(*) from public.profiles) <> 0 then raise exception 'Missing subject bypassed RLS'; end if;
end $$;

rollback;

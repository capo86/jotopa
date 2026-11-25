begin;
create temporary table phase2a_context(event_id uuid, other_id uuid, guest_id uuid);
grant select,insert,update on phase2a_context to authenticated;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'phase2a-'||i||'@example.test','{"full_name":"Guest SQL fixture"}',now() from generate_series(1,8) i;
set local role authenticated;
do $$ declare first_event uuid; second_event uuid; first_guest uuid; begin
  perform set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  first_event:=public.create_event('Guest SQL fixture','phase2a-sql-event','other','2027-07-01T20:00:00Z');
  first_guest:=public.save_guest(first_event,'{"full_name":"Private guest","email":"private@example.test","phone":"0981123456","document_id":"ABC123"}');
  perform set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  second_event:=public.create_event('Guest isolation','phase2a-sql-isolated','other','2027-07-01T20:00:00Z');
  insert into phase2a_context values(first_event,second_event,first_guest);
end $$;
reset role;
insert into public.event_members(event_id,user_id,role)
select c.event_id,('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,(array['manager','invitations','content','moderator','checkin','viewer'])[i-1]::public.event_role
from phase2a_context c cross join generate_series(2,7) i;
do $$ begin
  if not (select relrowsecurity from pg_class where oid='public.guests'::regclass) then raise exception 'Guests RLS disabled'; end if;
  if has_table_privilege('authenticated','public.guests','insert,update,delete') then raise exception 'Direct DML granted'; end if;
  if has_column_privilege('authenticated','public.guests','invite_token','select') then raise exception 'Token column exposed'; end if;
  if has_function_privilege('authenticated','public.apply_guest_import(uuid,jsonb)','execute') or has_function_privilege('anon','public.save_guest(uuid,jsonb,uuid)','execute') then raise exception 'Internal or anonymous execution granted'; end if;
end $$;
set local role authenticated;
do $$ declare c record; i integer; payload jsonb; temp_id uuid; begin
  select * into c from phase2a_context;
  for i in 1..8 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','30000000-0000-4000-8000-'||lpad(i::text,12,'0'),'role','authenticated')::text,true);
    if (select count(*) from public.guests where event_id=c.event_id)<>(case when i<=3 then 1 else 0 end) then raise exception 'Contact RLS role leak'; end if;
    if (select count(*) from public.guest_roster where event_id=c.event_id)<>(case when i in (1,2,3,6) then 1 else 0 end) then raise exception 'Roster role leak'; end if;
    if i in (1,2,3,6) then
      payload:=public.list_guests(c.event_id);
      if i=6 and (payload->'rows'->0 ? 'email' or payload->'rows'->0 ? 'phone' or payload->'rows'->0 ? 'document_id' or payload->'rows'->0 ? 'group_label') then raise exception 'Roster contains personal data'; end if;
    else begin perform public.list_guests(c.event_id); raise exception 'Forbidden list allowed'; exception when insufficient_privilege then null; end; end if;
    if i<=3 then
      temp_id:=public.save_guest(c.event_id,'{"full_name":"Allowed mutation"}');
      perform public.delete_guest(c.event_id,temp_id);
    else
      begin perform public.save_guest(c.event_id,'{"full_name":"Forbidden mutation"}'); raise exception 'Unauthorized save allowed'; exception when insufficient_privilege then null; end;
      begin perform public.delete_guest(c.event_id,c.guest_id); raise exception 'Unauthorized delete allowed'; exception when insufficient_privilege then null; end;
      begin perform public.export_guests(c.event_id); raise exception 'Unauthorized export allowed'; exception when insufficient_privilege then null; end;
      begin perform public.import_guests(c.event_id,'[{"data":{"full_name":"Forbidden import"}}]',gen_random_uuid()); raise exception 'Unauthorized import allowed'; exception when insufficient_privilege then null; end;
    end if;
  end loop;
end $$;

-- Inject an unexpected failure on the second row. It must roll back the first
-- row and its audit entry too, instead of returning a misleading partial report.
reset role;
create function pg_temp.fail_guest_fixture() returns trigger language plpgsql as $$ begin
  if new.full_name='Atomic failure fixture' then raise exception 'injected_fixture_failure' using errcode='XX000'; end if;
  return new;
end $$;
create trigger guest_atomic_fixture before insert on public.guests for each row execute function pg_temp.fail_guest_fixture();
set local role authenticated;
do $$ declare c record; before_count bigint; before_audit bigint; failed boolean:=false; report jsonb; begin
  select * into c from phase2a_context;
  perform set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  select count(*) into before_count from public.guests where event_id=c.event_id;
  select count(*) into before_audit from public.audit_log where event_id=c.event_id;
  begin
    perform public.import_guests(c.event_id,'[{"row_number":2,"data":{"full_name":"Atomic first fixture"}},{"row_number":3,"data":{"full_name":"Atomic failure fixture"}}]',gen_random_uuid());
  exception when sqlstate 'XX000' then failed:=true; end;
  if not failed then raise exception 'Injected failure not propagated'; end if;
  if (select count(*) from public.guests where event_id=c.event_id)<>before_count or (select count(*) from public.audit_log where event_id=c.event_id)<>before_audit then raise exception 'Failed import was not atomic'; end if;
  report:=public.import_guests(c.event_id,'[{"row_number":2,"data":{"full_name":"Preview fixture","email":"preview@example.test"}},{"row_number":3,"data":{"full_name":"Invalid","phone":"+999123456789"}}]',gen_random_uuid(),true);
  if report->>'created'<>'1' or report->>'rejected'<>'1' then raise exception 'Wrong preview counts'; end if;
  if (select count(*) from public.guests where event_id=c.event_id)<>before_count or (select count(*) from public.audit_log where event_id=c.event_id)<>before_audit then raise exception 'Preview wrote data'; end if;
end $$;
rollback;

begin;

create temporary table phase1b_context(event_id uuid, other_id uuid, token text, invite_id uuid);
grant select,insert,update on phase1b_context to authenticated;
insert into auth.users(id,email,raw_user_meta_data)
select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, 'phase1b-rls-'||i||'@example.test', '{"full_name":"RLS fixture"}'::jsonb from generate_series(1,9) i;
update auth.users set email_confirmed_at=now() where id::text like '20000000-0000-4000-8000-%';

set local role authenticated;
do $$ declare first_event uuid; second_event uuid; begin
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  first_event:=public.create_event('SQL roles','sql-roles-fixture','other','2027-07-01T20:00:00Z');
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  second_event:=public.create_event('SQL isolated','sql-isolated-fixture','other','2027-07-01T20:00:00Z');
  insert into phase1b_context(event_id,other_id) values(first_event,second_event);
end $$;
reset role;
insert into public.event_members(event_id,user_id,role)
select c.event_id,('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  (array['manager','invitations','content','moderator','checkin','viewer'])[i-1]::public.event_role
from phase1b_context c cross join generate_series(2,7) i;

do $$ begin
  if (select count(*) from pg_class where oid in ('public.events'::regclass,'public.event_members'::regclass,'public.event_member_invites'::regclass,'public.audit_log'::regclass) and relrowsecurity)<>4 then raise exception 'All four tables must enforce RLS'; end if;
  if has_function_privilege('authenticated','public.valid_event_member_invite(text)','execute') then raise exception 'Internal token helper is executable'; end if;
end $$;

set local role anon;
do $$ begin
  begin perform * from public.events; raise exception 'Anonymous event read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.create_event('No auth','no-auth-fixture','other','2027-07-01T20:00:00Z'); raise exception 'Anonymous creation allowed'; exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
do $$
declare c record; i integer; expected_role public.event_role; expected_edit boolean;
begin
  select * into c from phase1b_context;
  for i in 1..7 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-4000-8000-'||lpad(i::text,12,'0'),'role','authenticated')::text,true);
    expected_role:=(array['owner','manager','invitations','content','moderator','checkin','viewer'])[i]::public.event_role;
    if public.get_my_event_role(c.event_id)<>expected_role then raise exception 'Wrong event role'; end if;
    if not public.has_event_permission(c.event_id,'event.read') then raise exception 'Member cannot read own event'; end if;
    if (select count(*) from public.events where id=c.event_id)<>1 or (select count(*) from public.events where id=c.other_id)<>0 then raise exception 'Cross-event isolation failed'; end if;
    expected_edit:=i in (1,2);
    if public.has_event_permission(c.event_id,'event.update')<>expected_edit or public.has_event_permission(c.event_id,'members.manage')<>expected_edit then raise exception 'Wrong management permission'; end if;
    if public.has_event_permission(c.event_id,'event.delete')<>(i=1) then raise exception 'Wrong deletion permission'; end if;
    if public.has_event_permission(c.event_id,'guests.contact_read')<>(i in (1,2,3)) then raise exception 'Contact permission leaked'; end if;
    if public.has_event_permission(c.event_id,'content.write')<>(i in (1,2,4)) then raise exception 'Wrong content permission'; end if;
    if public.has_event_permission(c.event_id,'wall.moderate')<>(i in (1,2,5)) then raise exception 'Wrong moderation permission'; end if;
    if public.has_event_permission(c.event_id,'checkin.write')<>(i in (1,2,6)) then raise exception 'Wrong checkin permission'; end if;
    if public.has_event_permission(c.event_id,'dashboard.read')<>(i in (1,2,3,7)) then raise exception 'Wrong dashboard permission'; end if;
    if public.has_event_permission(c.event_id,'unknown.permission') then raise exception 'Unknown permission granted'; end if;
    if not expected_edit then
      if (select count(*) from public.audit_log where event_id=c.event_id)<>0 then raise exception 'Audit exposed to a restricted role'; end if;
      begin perform public.update_event(c.event_id,'Forbidden','sql-roles-fixture','other','2027-07-01T20:00:00Z','America/Asuncion'); raise exception 'Restricted role updated event'; exception when insufficient_privilege then null; end;
      begin perform public.create_event_member_invite(c.event_id,'sql-target@example.test','viewer'); raise exception 'Restricted role invited a member'; exception when insufficient_privilege then null; end;
    end if;
  end loop;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  begin update public.event_members set role='owner' where event_id=c.event_id; raise exception 'Direct role write allowed'; exception when insufficient_privilege then null; end;
  begin perform public.change_event_member_role(c.event_id,auth.uid(),'viewer'); raise exception 'Self role change allowed'; exception when insufficient_privilege then null; end;
  begin perform public.remove_event_member(c.event_id,auth.uid()); raise exception 'Last owner removed' using errcode='XX000'; exception when check_violation then null; end;
  begin insert into public.audit_log(event_id,action,target) values(c.event_id,'forged',c.event_id); raise exception 'Audit insert allowed'; exception when insufficient_privilege then null; end;
  begin update public.audit_log set action='forged'; raise exception 'Audit update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.audit_log; raise exception 'Audit delete allowed'; exception when insufficient_privilege then null; end;
  begin perform token_hash from public.event_member_invites; raise exception 'Hash read allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  begin perform public.create_event_member_invite(c.event_id,'sql-target@example.test','owner'); raise exception 'Manager invited owner'; exception when insufficient_privilege then null; end;
  begin perform public.change_event_member_role(c.event_id,'20000000-0000-4000-8000-000000000001','viewer'); raise exception 'Manager changed owner'; exception when insufficient_privilege then null; end;
  begin perform public.remove_event_member(c.event_id,'20000000-0000-4000-8000-000000000001'); raise exception 'Manager removed owner'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  if (select count(*) from public.event_members where event_id=c.event_id)<>0 or (select count(*) from public.event_member_invites where event_id=c.event_id)<>0 then raise exception 'Foreign team/invites visible'; end if;
end $$;

do $$ declare c record; issued record; begin
  select * into c from phase1b_context;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  select * into issued from public.create_event_member_invite(c.event_id,'phase1b-rls-9@example.test','content');
  update phase1b_context set token=issued.token,invite_id=issued.invite_id;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  begin perform public.accept_event_member_invite(issued.token); raise exception 'Wrong email accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
  perform public.accept_event_member_invite(issued.token);
  if public.get_my_event_role(c.event_id)<>'content' then raise exception 'Stored invite role not respected'; end if;
  begin perform public.accept_event_member_invite(issued.token); raise exception 'Reused token accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
end $$;

do $$ declare c record; issued record; begin
  select * into c from phase1b_context;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  select * into issued from public.create_event_member_invite(c.event_id,'phase1b-rls-8@example.test','viewer');
  update phase1b_context set token=issued.token,invite_id=issued.invite_id;
end $$;
reset role;
update public.event_member_invites set expires_at=now()-interval '1 second' where id=(select invite_id from phase1b_context);
set local role authenticated;
do $$ declare c record; begin
  select * into c from phase1b_context;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  begin perform public.accept_event_member_invite(c.token); raise exception 'Expired token accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  perform set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  if not exists(select 1 from public.audit_log where event_id=c.event_id and action='invite.accepted' and actor_id='20000000-0000-4000-8000-000000000009') then raise exception 'Acceptance audit missing or actor spoofed'; end if;
  if exists(select 1 from public.audit_log where event_id=c.event_id and (meta::text like '%@%' or meta ? 'token' or meta ? 'email')) then raise exception 'Sensitive invite values in audit'; end if;
  perform public.change_event_member_role(c.event_id,'20000000-0000-4000-8000-000000000009','owner');
  perform public.remove_event_member(c.event_id,'20000000-0000-4000-8000-000000000009');
  if (select count(*) from public.event_members where event_id=c.event_id and role='owner')<>1 then raise exception 'Owner invariant failed'; end if;
end $$;

rollback;

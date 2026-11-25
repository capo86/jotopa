begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select ('80000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'seating-sql-'||i||'@example.test','{"full_name":"Seating SQL fixture"}',now() from generate_series(1,8)i;
create temporary table seating_context(event_id uuid,other_id uuid,guest_id uuid,table_id uuid,token text);
grant select,insert on seating_context to authenticated,anon;
set local role authenticated;
do $$ declare ev uuid;other_ev uuid;guest_uuid uuid;table_uuid uuid;begin
  perform set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  ev:=public.create_event('SQL seating','seating-sql-event','other',now()+interval '10 days');
  perform public.update_event(ev,'SQL seating','seating-sql-event','other',now()+interval '10 days','America/Asuncion',now()+interval '9 days','active');
  guest_uuid:=public.save_guest(ev,'{"full_name":"Party of five","party_size":5,"email":"private-seating@example.test"}');
  table_uuid:=public.save_event_table(ev,'Mesa 8');
  perform set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  other_ev:=public.create_event('Other SQL event','seating-other-sql','other',now()+interval '10 days');
  perform set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  insert into seating_context values(ev,other_ev,guest_uuid,table_uuid,public.get_guest_invitation_token(ev,guest_uuid));
end $$;
reset role;
insert into public.event_members(event_id,user_id,role)
select c.event_id,('80000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,(array['manager','invitations','content','moderator','checkin','viewer'])[i-1]::public.event_role from seating_context c cross join generate_series(2,7)i;
do $$ begin
  if not(select relrowsecurity from pg_class where oid='public.event_tables'::regclass) or not(select relrowsecurity from pg_class where oid='private.legacy_maybe_responses'::regclass) then raise exception 'Stage B table RLS disabled';end if;
  if has_schema_privilege('anon','private','usage') or has_schema_privilege('authenticated','private','usage') then raise exception 'Legacy response archive exposed';end if;
end $$;
set local role authenticated;
do $$ declare c record;i integer;result jsonb;begin
  select * into c from seating_context;
  for i in 1..8 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','80000000-0000-4000-8000-'||lpad(i::text,12,'0'),'role','authenticated')::text,true);
    if (select count(*) from public.event_tables where event_id=c.event_id)<>(case when i in (1,2,3,4,6) then 1 else 0 end) then raise exception 'Table row isolation failed for role %',i;end if;
    if i in (1,2,3,4) then
      perform public.assign_guest_table(c.event_id,c.guest_id,c.table_id);
      result:=public.list_seating_guests(c.event_id);
      if result::text like '%private-seating%' or result->'rows'->0 ? 'phone' or result->'rows'->0 ? 'email' then raise exception 'Seating RPC leaked contacts';end if;
    else
      begin perform public.assign_guest_table(c.event_id,c.guest_id,c.table_id);raise exception 'Restricted role assigned table';exception when insufficient_privilege then null;end;
      begin perform public.list_seating_guests(c.event_id);raise exception 'Restricted role read seating roster';exception when insufficient_privilege then null;end;
    end if;
    if i in (1,2,4) then perform public.save_event_table(c.event_id,'Mesa 8',c.table_id);
    else begin perform public.save_event_table(c.event_id,'Changed',c.table_id);raise exception 'Restricted role edited table';exception when insufficient_privilege then null;end;end if;
    if i in (1,2) then perform public.configure_table_visibility(c.event_id,true);
    else begin perform public.configure_table_visibility(c.event_id,true);raise exception 'Restricted role published tables';exception when insufficient_privilege then null;end;end if;
    begin update public.event_tables set name='Direct write' where id=c.table_id;raise exception 'Direct table DML allowed';exception when insufficient_privilege then null;end;
    begin update public.guests set table_id=null where id=c.guest_id;raise exception 'Direct assignment allowed';exception when insufficient_privilege then null;end;
  end loop;
  perform set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  begin perform public.delete_event_table(c.event_id,c.table_id);raise exception 'Assigned table deleted';exception when sqlstate '22023' then null;end;
end $$;
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from seating_context;perform set_config('request.jwt.claims','{}',true);
  result:=public.guest_invitation(c.token,'{"action":"respond","response":"yes","attending_count":3,"expected_version":0}');
  if result->>'ok'<>'true' or result->'guest'->>'attending_count'<>'3' or result->'guest'->>'party_size'<>'5' or result->'guest'->>'table_name'<>'Mesa 8' then raise exception 'Whole party RSVP failed';end if;
  if public.guest_invitation(c.token,'{"action":"respond","response":"yes","attending_count":6,"expected_version":1}')->>'code'<>'invalid_attendance' then raise exception 'Capacity overflow accepted';end if;
  if public.guest_invitation(c.token,'{"action":"respond","response":"maybe","attending_count":0,"expected_version":1}')->>'code'<>'invalid_response' then raise exception 'New Maybe accepted';end if;
  result:=public.guest_invitation(c.token,'{"action":"respond","response":"no","attending_count":0,"expected_version":1}');
  if result->'guest'->>'attending_count'<>'0' then raise exception 'Negative response retained people';end if;
  if public.guest_invitation(c.token,jsonb_build_object('action','read','event_id',c.other_id))->>'code'<>'invalid_request' then raise exception 'Token escaped event';end if;
  begin perform * from public.event_tables;raise exception 'Anonymous tables readable';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.events set rsvp_deadline=clock_timestamp()-interval '1 second' where id=(select event_id from seating_context);
delete from private.invitation_rate_limits where guest_id=(select guest_id from seating_context);
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from seating_context;
  result:=public.guest_invitation(c.token);
  if result->>'ok'<>'true' or result->>'can_respond'<>'false' or result->'guest'->>'table_name'<>'Mesa 8' then raise exception 'Deadline blocked invitation/table read';end if;
  if public.guest_invitation(c.token,'{"action":"respond","response":"yes","attending_count":1,"expected_version":2}')->>'code'<>'rsvp_closed' then raise exception 'Expired RSVP accepted';end if;
end $$;
rollback;

begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select ('50000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'phase3a-'||i||'@example.test','{"full_name":"Delivery SQL fixture"}',now() from generate_series(1,8)i;
create temporary table phase3a_context(event_id uuid,guest_id uuid,template_id uuid,token text);
grant select,insert on phase3a_context to authenticated,anon;
set local role authenticated;
do $$ declare ev uuid; guest_uuid uuid; template_uuid uuid;begin
  perform set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  ev:=public.create_event('SQL delivery','phase3a-sql-event','other',now()+interval '10 days');
  perform public.update_event(ev,'SQL delivery','phase3a-sql-event','other',now()+interval '10 days','America/Asuncion',now()+interval '9 days','active');
  guest_uuid:=public.save_guest(ev,'{"full_name":"Private guest","phone":"0981123456","contact_consent":true}');
  select id into template_uuid from public.message_templates where event_id=ev limit 1;
  insert into phase3a_context values(ev,guest_uuid,template_uuid,public.get_guest_invitation_token(ev,guest_uuid));
end $$;
reset role;
insert into public.event_members(event_id,user_id,role) select c.event_id,('50000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,(array['manager','invitations','content','moderator','checkin','viewer'])[i-1]::public.event_role from phase3a_context c cross join generate_series(2,7)i;
do $$ begin
  if (select count(*) from pg_class where oid in ('public.invitations'::regclass,'public.invitation_events'::regclass,'public.message_templates'::regclass) and relrowsecurity)<>3 then raise exception 'New tables must enforce RLS';end if;
  if has_function_privilege('anon','private.record_invitation_open(uuid,uuid)','execute') then raise exception 'Anonymous helper exposed';end if;
end $$;
set local role authenticated;
do $$ declare c record; i integer; sent jsonb; request_uuid uuid:=gen_random_uuid();begin
  select * into c from phase3a_context;
  for i in 1..8 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','50000000-0000-4000-8000-'||lpad(i::text,12,'0'),'role','authenticated')::text,true);
    if (select count(*) from public.invitations where event_id=c.event_id)<>(case when i<=3 then 1 else 0 end) then raise exception 'Invitation isolation failed';end if;
    if i>3 then
      begin perform public.list_invitation_queue(c.event_id);raise exception 'Restricted role read queue';exception when insufficient_privilege then null;end;
      begin perform public.get_guest_invitation_history(c.event_id,c.guest_id);raise exception 'Restricted role read timeline';exception when insufficient_privilege then null;end;
      begin perform public.manual_invitation_action(c.event_id,c.guest_id,'send',gen_random_uuid(),c.template_id);raise exception 'Restricted role sent invitation';exception when insufficient_privilege then null;end;
    end if;
  end loop;
  perform set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  sent:=public.manual_invitation_action(c.event_id,c.guest_id,'send',request_uuid,c.template_id);
  if public.manual_invitation_action(c.event_id,c.guest_id,'send',request_uuid,c.template_id)->>'replayed'<>'true' then raise exception 'Send retry not idempotent';end if;
  begin update public.invitation_events set type='opened';raise exception 'History alteration allowed';exception when insufficient_privilege then null;end;
  begin delete from public.invitation_events;raise exception 'History deletion allowed';exception when insufficient_privilege then null;end;
  perform public.manual_invitation_action(c.event_id,c.guest_id,'undo',gen_random_uuid(),null,request_uuid);
end $$;
set local role anon;
do $$ declare c record; visit_uuid uuid:=gen_random_uuid();data jsonb;begin
  select * into c from phase3a_context;perform set_config('request.jwt.claims','{}',true);
  begin perform id from public.invitation_events;raise exception 'Anonymous timeline exposed';exception when insufficient_privilege then null;end;
  data:=public.guest_invitation(c.token,jsonb_build_object('action','read','visit_id',visit_uuid));
  if data->>'ok'<>'true' then raise exception 'Valid visit failed';end if;
  perform public.guest_invitation(c.token,jsonb_build_object('action','read','visit_id',visit_uuid));
  perform public.guest_invitation(c.token,'{"action":"respond","response":"yes","companions":0,"expected_version":0}');
end $$;
reset role;
do $$ declare c record;begin
  select * into c from phase3a_context;
  if (select open_count from public.invitations where guest_id=c.guest_id and channel='link')<>1 then raise exception 'Visit duplicated';end if;
  if (select status from public.invitations where guest_id=c.guest_id and channel='link')<>'responded' then raise exception 'RSVP did not update tracking';end if;
  if (select count(*) from public.invitation_events where event_id=c.event_id and type='rsvp')<>1 then raise exception 'RSVP missing from timeline';end if;
  if exists(select 1 from public.invitation_events where event_id=c.event_id and meta::text like '%'||c.token||'%') then raise exception 'Token logged';end if;
end $$;
rollback;

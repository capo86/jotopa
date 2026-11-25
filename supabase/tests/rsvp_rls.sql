begin;
create temporary table phase2b_context(event_id uuid,guest_id uuid,other_guest_id uuid,token text,other_token text);
grant select,insert,update on phase2b_context to authenticated,anon;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values('40000000-0000-4000-8000-000000000001','phase2b-sql@example.test','{"full_name":"RSVP SQL fixture"}',now());
set local role authenticated;
do $$ declare ev uuid; guest_one uuid; guest_two uuid; begin
  perform set_config('request.jwt.claims','{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  ev:=public.create_event('SQL RSVP fixture','phase2b-sql-event','other',now()+interval '10 days');
  perform public.update_event(ev,'SQL RSVP fixture','phase2b-sql-event','other',now()+interval '10 days','America/Asuncion',now()+interval '9 days','active');
  guest_one:=public.save_guest(ev,'{"full_name":"Only this person","email":"private@example.test","companions_allowed":2}');
  guest_two:=public.save_guest(ev,'{"full_name":"Another person","companions_allowed":1}');
  insert into phase2b_context values(ev,guest_one,guest_two,public.get_guest_invitation_token(ev,guest_one),public.get_guest_invitation_token(ev,guest_two));
end $$;
reset role;
do $$ begin
  if not(select relrowsecurity from pg_class where oid='private.invitation_rate_limits'::regclass) then raise exception 'Rate table RLS disabled';end if;
  if has_schema_privilege('anon','private','usage') or has_table_privilege('authenticated','private.invitation_rate_limits','select') then raise exception 'Private limits exposed';end if;
  if has_function_privilege('anon','private.take_invitation_limit(text,text,uuid,integer)','execute') then raise exception 'Private helper exposed';end if;
end $$;
set local role anon;
do $$ declare c record; data jsonb; version_value integer; begin
  select * into c from phase2b_context;
  perform set_config('request.jwt.claims','{}',true);
  begin perform invite_token from public.guests;raise exception 'Anonymous table read allowed';exception when insufficient_privilege then null;end;
  begin perform public.get_guest_invitation_token(c.event_id,c.guest_id);raise exception 'Anonymous token management allowed';exception when insufficient_privilege then null;end;
  data:=public.guest_invitation(c.token);
  if data->>'ok'<>'true' or data->'guest'->>'full_name'<>'Only this person' then raise exception 'Wrong public projection';end if;
  if data->'guest' ? 'email' or data->'guest' ? 'id' or data->'guest' ? 'invite_token' or data->'event' ? 'created_by' then raise exception 'Private columns leaked';end if;
  if public.guest_invitation('invalid')->>'code'<>'invitation_unavailable' then raise exception 'Invalid token accepted';end if;
  if public.guest_invitation(c.token,jsonb_build_object('action','read','guest_id',c.other_guest_id))->>'code'<>'invalid_request' then raise exception 'Foreign guest argument accepted';end if;
  data:=public.guest_invitation(c.token,'{"action":"respond","response":"yes","companions":2,"expected_version":0}');
  if data->'guest'->>'rsvp_status'<>'yes' or data->'guest'->>'companions_confirmed'<>'2' or data->'guest'->>'version'<>'1' then raise exception 'RSVP failed';end if;
  if public.guest_invitation(c.other_token)->'guest'->>'rsvp_status'<>'pending' then raise exception 'Other guest changed';end if;
  if public.guest_invitation(c.token,'{"action":"respond","response":"no","companions":1,"expected_version":1}')->>'code'<>'invalid_companions' then raise exception 'No response accepted companions';end if;
  if public.guest_invitation(c.token,'{"action":"respond","response":"no","companions":0,"expected_version":0}')->>'code'<>'response_changed' then raise exception 'Stale response overwrote current RSVP';end if;
  if public.guest_invitation(c.token,'{"action":"opt_out"}')->'guest'->>'opted_out'<>'true' then raise exception 'Opt-out not saved';end if;
end $$;
reset role;
update public.events set rsvp_deadline=now()-interval '1 second' where id=(select event_id from phase2b_context);
delete from private.invitation_rate_limits where guest_id=(select guest_id from phase2b_context);
set local role anon;
do $$ declare c record; begin
  select * into c from phase2b_context;
  if (public.guest_invitation(c.token)->>'can_respond')::boolean then raise exception 'Deadline not enforced';end if;
  if public.guest_invitation(c.token,'{"action":"respond","response":"no","companions":0,"expected_version":1}')->>'code'<>'rsvp_closed' then raise exception 'Closed deadline accepted RSVP';end if;
end $$;
reset role;
update public.events set session_closes_at=now()-interval '1 second',session_opens_at=now()-interval '1 day' where id=(select event_id from phase2b_context);
set local role anon;
do $$ declare c record;begin
  select * into c from phase2b_context;
  if public.guest_invitation(c.token)->>'code'<>'invitation_unavailable' then raise exception 'Expired access exposed invitation';end if;
end $$;
rollback;

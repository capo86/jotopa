begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'wall-sql-'||i||'@example.test','{"full_name":"Wall SQL fixture"}',now() from generate_series(1,8)i;
create temporary table wall_context(event_id uuid,other_id uuid,guest_id uuid,other_guest uuid,token text,other_token text,post_id uuid);
grant select,insert,update on wall_context to authenticated,anon;
set local role authenticated;
do $$ declare ev uuid;other_ev uuid;g uuid;og uuid;begin
  perform set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  ev:=public.create_event('SQL wall','wall-sql-event','other',now()+interval '10 days');
  perform public.update_event(ev,'SQL wall','wall-sql-event','other',now()+interval '10 days','America/Asuncion',now()-interval '1 hour','active');
  g:=public.save_guest(ev,'{"full_name":"Familia SQL","party_size":5,"email":"private-wall@example.test"}');
  perform set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  other_ev:=public.create_event('Other wall','wall-other-sql','other',now()+interval '10 days');
  perform public.update_event(other_ev,'Other wall','wall-other-sql','other',now()+interval '10 days','America/Asuncion',now()+interval '9 days','active');
  og:=public.save_guest(other_ev,'{"full_name":"Another holder","party_size":1}');
  insert into wall_context(event_id,other_id,guest_id,other_guest,other_token) values(ev,other_ev,g,og,public.get_guest_invitation_token(other_ev,og));
  perform set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  update wall_context set token=public.get_guest_invitation_token(ev,g);
end $$;
reset role;
insert into public.event_members(event_id,user_id,role)
select c.event_id,('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,(array['manager','invitations','content','moderator','checkin','viewer'])[i-1]::public.event_role from wall_context c cross join generate_series(2,7)i;
do $$ declare name text;begin
  foreach name in array array['event_wall_settings','wall_posts','wall_post_media'] loop
    if not(select relrowsecurity from pg_class where oid=('public.'||name)::regclass) then raise exception 'Wall RLS disabled';end if;
  end loop;
  if exists(select 1 from storage.buckets where id in ('wall-media','wall-audio') and public) then raise exception 'Wall bucket is public';end if;
  if has_function_privilege('anon','public.complete_wall_media(uuid)','execute') or has_function_privilege('authenticated','public.complete_wall_media(uuid)','execute') or has_function_privilege('authenticated','public.finish_wall_purge(uuid)','execute') then raise exception 'Server attestation exposed';end if;
end $$;
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from wall_context;perform set_config('request.jwt.claims','{}',true);
  result:=public.guest_invitation(c.token);
  if result->>'can_respond'<>'false' or result->'guest'->>'rsvp_status'<>'pending' then raise exception 'Invalid independent-period fixture';end if;
  result:=public.guest_wall(c.token,'{"action":"begin","body":"SQL dedication","participant_name":"Ana","photo_count":0,"audio_count":0,"request_id":"90000000-0000-4000-8000-000000000099"}');
  if result->>'ok'<>'true' then raise exception 'Pending RSVP could not participate';end if;
  update wall_context set post_id=(result->>'post_id')::uuid;
  perform public.guest_wall(c.token,jsonb_build_object('action','submit','post_id',result->>'post_id'));
  if jsonb_array_length(public.guest_wall(c.token)->'posts')<>0 then raise exception 'Pending post was public';end if;
  begin perform * from public.wall_posts;raise exception 'Anonymous table access';exception when insufficient_privilege then null;end;
  begin perform * from public.wall_post_media;raise exception 'Anonymous media access';exception when insufficient_privilege then null;end;
  if public.guest_wall(c.other_token,jsonb_build_object('action','submit','post_id',(select post_id from wall_context)))->>'code'<>'post_unavailable' then raise exception 'Another token controlled post';end if;
end $$;
set local role authenticated;
do $$ declare c record;i integer;allowed boolean;begin
  select * into c from wall_context;
  for i in 1..8 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','90000000-0000-4000-8000-'||lpad(i::text,12,'0'),'role','authenticated')::text,true);
    allowed:=i in (1,2,5);
    if (select count(*) from public.wall_posts where event_id=c.event_id)<>(case when allowed then 1 else 0 end) then raise exception 'Wall role isolation %',i;end if;
    if allowed then perform public.moderate_wall_post(c.post_id,'approved');
    else begin perform public.moderate_wall_post(c.post_id,'approved');raise exception 'Unauthorized moderation';exception when raise_exception then if sqlerrm<>'not_authorized' then raise;end if;end;end if;
    if i in (1,2) then perform public.configure_event_wall(c.event_id,true,null,null,30);
    else begin perform public.configure_event_wall(c.event_id,true,null,null,30);raise exception 'Unauthorized configuration';exception when raise_exception then if sqlerrm<>'not_authorized' then raise;end if;end;end if;
    begin update public.wall_posts set status='approved' where id=c.post_id;raise exception 'Direct wall mutation';exception when insufficient_privilege then null;end;
    begin delete from public.wall_post_media where post_id=c.post_id;raise exception 'Direct media mutation';exception when insufficient_privilege then null;end;
    if i not in (1,2,3) and exists(select 1 from public.guests where event_id=c.event_id) then raise exception 'Moderation leaked contacts';end if;
  end loop;
end $$;
reset role;
update public.guests set rsvp_status='no',companions_confirmed=0 where id=(select guest_id from wall_context);
delete from private.invitation_rate_limits where guest_id in(select guest_id from wall_context union select other_guest from wall_context);
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from wall_context;
  result:=public.guest_wall(c.token);
  if result->>'can_post'<>'true' or jsonb_array_length(result->'posts')<>1 then raise exception 'Declined guest blocked or approved history lost';end if;
  if result->'posts'->0->>'author_name'<>'Familia SQL' or result->'posts'->0->>'participant_name'<>'Ana' or result::text like '%private-wall%' or result->'posts'->0 ? 'guest_id' then raise exception 'Author binding/privacy failed';end if;
  if jsonb_array_length(public.guest_wall(c.other_token)->'posts')<>0 then raise exception 'Cross-event history';end if;
  if public.guest_wall(repeat('0',64))->>'code'<>'invitation_unavailable' then raise exception 'Invalid token accepted';end if;
  if public.guest_wall(c.token,'{"action":"begin","body":"Spoof","author_name":"Other","photo_count":0,"audio_count":0,"request_id":"90000000-0000-4000-8000-000000000098"}')->>'code'<>'invalid_request' then raise exception 'Client supplied identity';end if;
end $$;
reset role;
update public.event_wall_settings set enabled=false where event_id=(select event_id from wall_context);
delete from private.invitation_rate_limits where guest_id=(select guest_id from wall_context);
set local role anon;
do $$ declare c record;begin
  select * into c from wall_context;
  if public.guest_wall(c.token)->>'can_post'<>'false' then raise exception 'Suspension ignored';end if;
  if public.guest_wall(c.token,'{"action":"begin","body":"Closed","photo_count":0,"audio_count":0,"request_id":"90000000-0000-4000-8000-000000000097"}')->>'code'<>'wall_closed' then raise exception 'Suspended writes accepted';end if;
end $$;
reset role;
do $$ declare c record;begin
  select * into c from wall_context;
  if not exists(select 1 from public.audit_log where event_id=c.event_id and action='wall.submitted') or not exists(select 1 from public.audit_log where event_id=c.event_id and action='wall.moderated') then raise exception 'Wall audit missing';end if;
  if exists(select 1 from public.audit_log where event_id=c.event_id and (meta::text like '%'||c.token||'%' or meta::text like '%SQL dedication%' or meta::text like '%private-wall%')) then raise exception 'Private values in audit';end if;
end $$;
rollback;

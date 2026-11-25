begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select ('a1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'projection-sql-'||i||'@example.test','{"full_name":"Projection SQL fixture"}',now() from generate_series(1,8)i;
create temporary table projection_context(event_id uuid,other_id uuid,guest_id uuid,token text,access text,slug text,topic text,post_id uuid,revision bigint);
grant select,insert,update on projection_context to authenticated,anon;
set local role authenticated;
do $$ declare ev uuid;other_ev uuid;g uuid;begin
  perform set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  ev:=public.create_event('SQL projection','projection-sql-event','other',now()+interval '10 days');
  perform public.update_event(ev,'SQL projection','projection-sql-event','other',now()+interval '10 days','America/Asuncion',now()-interval '1 hour','active');
  g:=public.save_guest(ev,'{"full_name":"Titular SQL","party_size":3,"email":"private-projection@example.test"}');
  insert into projection_context(event_id,guest_id,token,slug) values(ev,g,public.get_guest_invitation_token(ev,g),'projection-sql-event');
  perform set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  other_ev:=public.create_event('Other projection','projection-other-sql','other',now()+interval '10 days');
  update projection_context set other_id=other_ev;
end $$;
reset role;
insert into public.event_members(event_id,user_id,role)
select c.event_id,('a1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,(array['manager','invitations','content','moderator','checkin','viewer'])[i-1]::public.event_role from projection_context c cross join generate_series(2,7)i;
set local role authenticated;
do $$ declare c record;i integer;result jsonb;begin
  select * into c from projection_context;
  for i in 1..8 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','a1000000-0000-4000-8000-'||lpad(i::text,12,'0'),'role','authenticated')::text,true);
    if public.can_receive_wall_updates('wall-moderation:'||c.event_id::text)<>(i in (1,2,5)) then raise exception 'Moderator broadcast isolation failed for role %',i;end if;
    if i in (1,2,5) then
      result:=public.issue_wall_projection_access(c.event_id);
      if result->>'access' !~ '^[a-f0-9]{64}$' then raise exception 'Projection credential entropy';end if;
      update projection_context set access=result->>'access';
      if public.get_wall_projection_status(c.event_id) ? 'access' or public.get_wall_projection_status(c.event_id) ? 'token_hash' then raise exception 'Status exposed credential';end if;
    else
      begin perform public.issue_wall_projection_access(c.event_id);raise exception 'Restricted role issued projection';exception when raise_exception then if sqlerrm<>'not_authorized' then raise;end if;end;
      begin perform public.revoke_wall_projection_access(c.event_id);raise exception 'Restricted role revoked projection';exception when raise_exception then if sqlerrm<>'not_authorized' then raise;end if;end;
    end if;
    begin perform * from private.wall_projection_access;raise exception 'Private projection storage exposed';exception when insufficient_privilege then null;end;
    begin update public.event_wall_settings set public_revision=999 where event_id=c.event_id;raise exception 'Direct revision mutation';exception when insufficient_privilege then null;end;
  end loop;
end $$;
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from projection_context;perform set_config('request.jwt.claims','{}',true);
  result:=public.sync_guest_wall(c.token);
  if result->>'ok'<>'true' or jsonb_array_length(result->'changes')<>0 then raise exception 'Initial guest sync';end if;
  update projection_context set topic=result->>'stream_topic';
  if not public.can_receive_wall_updates(result->>'stream_topic') or public.can_receive_wall_updates('wall-approved:'||repeat('0',64)) or public.can_receive_wall_updates('wall-moderation:'||c.event_id::text) then raise exception 'Anonymous topic authorization';end if;
  perform set_config('realtime.topic',result->>'stream_topic',true);
  if exists(select 1 from realtime.messages where topic is distinct from (result->>'stream_topic')) then raise exception 'Signal rows escaped authorized topic';end if;
  perform set_config('realtime.topic','',true);
  result:=public.guest_wall(c.token,'{"action":"begin","body":"Pending projection text","photo_count":0,"audio_count":0,"request_id":"a1000000-0000-4000-8000-000000000099"}');
  update projection_context set post_id=(result->>'post_id')::uuid;
  perform public.guest_wall(c.token,jsonb_build_object('action','submit','post_id',result->>'post_id'));
  if jsonb_array_length(public.sync_guest_wall(c.token)->'changes')<>0 then raise exception 'Pending content leaked via sync';end if;
  result:=public.projection_wall(c.slug,c.access);
  if result->>'ok'<>'true' or result->'event' ? 'created_by' or result->'event' ? 'id' or result::text like '%private-projection%' then raise exception 'Projection public shape';end if;
  if public.projection_wall('projection-other-sql',c.access)->>'code'<>'projection_unavailable' then raise exception 'Projection escaped event';end if;
  if public.projection_wall(c.slug,c.access,jsonb_build_object('action','submit','post_id',(select post_id from projection_context)))->>'code'<>'invalid_request' then raise exception 'Projection accepted writes';end if;
  if public.guest_invitation(c.access)->>'code'<>'invitation_unavailable' then raise exception 'Projection became personal invitation';end if;
  begin perform public.issue_wall_projection_access(c.event_id);raise exception 'Anonymous projection issuance';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
do $$ declare c record;begin
  select * into c from projection_context;perform set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  perform public.moderate_wall_post(c.post_id,'approved');
end $$;
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from projection_context;result:=public.sync_guest_wall(c.token);
  if jsonb_array_length(result->'changes')<>1 or result->'changes'->0->'post'->>'body'<>'Pending projection text' then raise exception 'Approved delta missing';end if;
  update projection_context set revision=(result->>'next_revision')::bigint;
end $$;
set local role authenticated;
do $$ declare c record;begin
  select * into c from projection_context;perform set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  perform public.moderate_wall_post(c.post_id,'hidden');
end $$;
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from projection_context;result:=public.sync_guest_wall(c.token,c.revision);
  if jsonb_array_length(result->'changes')<>1 or result->'changes'->0->'post'<>'null'::jsonb then raise exception 'Removal delta missing';end if;
end $$;
reset role;
update public.event_members set role='viewer' where event_id=(select event_id from projection_context) and user_id='a1000000-0000-4000-8000-000000000005';
delete from private.invitation_rate_limits where guest_id=(select guest_id from projection_context);
set local role anon;
do $$ declare c record;begin
  select * into c from projection_context;
  if public.projection_wall(c.slug,c.access)->>'code'<>'projection_unavailable' then raise exception 'Revoked issuer retained projection';end if;
end $$;
reset role;
do $$ declare c record;access_value text;begin
  select * into c from projection_context;
  perform set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
  update public.profiles set platform_role='super_admin' where user_id='a1000000-0000-4000-8000-000000000008';
  access_value:=public.issue_wall_projection_access(c.event_id)->>'access';
  update public.profiles set platform_role='organizer' where user_id='a1000000-0000-4000-8000-000000000008';
  if public.projection_wall(c.slug,access_value)->>'code'<>'projection_unavailable' then raise exception 'Platform demotion retained projection';end if;
  update public.profiles set platform_role='super_admin' where user_id='a1000000-0000-4000-8000-000000000008';
  if public.projection_wall(c.slug,access_value)->>'code'<>'projection_unavailable' then raise exception 'Restored administrator resurrected projection';end if;
  update public.profiles set platform_role='organizer' where user_id='a1000000-0000-4000-8000-000000000008';
  perform set_config('request.jwt.claims','{}',true);
end $$;

do $$ declare c record;begin
  select * into c from projection_context;
  if not(select relrowsecurity from pg_class where oid='private.wall_projection_access'::regclass) or not(select relrowsecurity from pg_class where oid='realtime.messages'::regclass) then raise exception 'Projection or realtime RLS disabled';end if;
  if exists(select 1 from public.audit_log where event_id=c.event_id and (meta::text like '%'||c.access||'%' or meta::text like '%'||c.token||'%')) then raise exception 'Projection credential audited';end if;
end $$;
rollback;

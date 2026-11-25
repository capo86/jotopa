begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select ('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'information-sql-'||i||'@example.test','{"full_name":"Information SQL fixture"}',now() from generate_series(1,3)i;
create temporary table information_context(event_id uuid,photo uuid,token text,draft jsonb);
grant select,insert,update on information_context to authenticated,anon;
set local role authenticated;
do $$ declare event_uuid uuid;guest_uuid uuid;begin
  perform set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  event_uuid:=public.create_event('Information SQL','information-sql-event','other',now()+interval '10 days');
  perform public.update_event(event_uuid,'Information SQL','information-sql-event','other',now()+interval '10 days','America/Asuncion',now()+interval '9 days','active');
  guest_uuid:=public.save_guest(event_uuid,'{"full_name":"Information guest"}');
  insert into information_context values(event_uuid,public.reserve_invitation_asset(event_uuid,'SQL image'),public.get_guest_invitation_token(event_uuid,guest_uuid),null);
end $$;
reset role;
insert into public.event_members(event_id,user_id,role) select event_id,'70000000-0000-4000-8000-000000000002','content' from information_context;
update public.event_invitation_assets set status='ready',width=100,height=100,bytes=100 where id=(select photo from information_context);
update information_context set draft=jsonb_build_object('version',2,'template','minimal','palette','olive','font_pair','classic','names','SQL invitation','eyebrow','','welcome','','show_guest_name',true,'closing','','dress_code','','details','','cover_asset_id',photo,'cover_focus','center','gallery','[]'::jsonb,'schedule','[]'::jsonb,'sections',(select jsonb_agg(jsonb_build_object('id',id,'enabled',true)) from unnest(array['welcome','countdown','schedule','dress','gallery','details','gifts','lodging','rsvp','closing']) id),'dress_photo_asset_id',null,'lodging','[]'::jsonb,'gifts','{"message":"Gift message","items":[],"banking":{"enabled":false,"bank_name":"PRIVATE BANK","holder":"PRIVATE HOLDER","account":"PRIVATE ACCOUNT","alias":"PRIVATE ALIAS","notes":"PRIVATE NOTES"}}'::jsonb);
set local role authenticated;
do $$ declare c record;revision integer;begin
  select * into c from information_context;
  perform set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  revision:=public.save_invitation_design(c.event_id,c.draft,0);
  begin perform public.publish_invitation_design(c.event_id,revision);raise exception 'Content role published information';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
  if exists(select 1 from public.event_invitation_designs where event_id=c.event_id) then raise exception 'Outsider read bank draft';end if;
  begin perform public.save_invitation_design(c.event_id,c.draft,revision);raise exception 'Outsider edited information';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  perform public.publish_invitation_design(c.event_id,revision);
end $$;
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from information_context;perform set_config('request.jwt.claims','{}',true);
  result:=public.guest_invitation(c.token,'{"action":"read"}');
  if result->>'ok'<>'true' or result::text like '%PRIVATE%' or result->'presentation'->'gifts'->'banking'->>'enabled'<>'false' then raise exception 'Non-published banking exposed';end if;
  if has_schema_privilege('anon','private','usage') then raise exception 'Private schema exposed';end if;
end $$;
set local role authenticated;
do $$ declare c record;revision integer;value jsonb;begin
  select * into c from information_context;
  perform set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  value:=jsonb_set(c.draft,'{gifts,banking,enabled}','true');
  revision:=public.save_invitation_design(c.event_id,value,1);perform public.publish_invitation_design(c.event_id,revision);
end $$;
set local role anon;
do $$ declare c record;result jsonb;begin
  select * into c from information_context;perform set_config('request.jwt.claims','{}',true);
  result:=public.guest_invitation(c.token,'{"action":"read"}');
  if result->'presentation'->'gifts'->'banking'->>'alias'<>'PRIVATE ALIAS' then raise exception 'Explicit banking publication failed';end if;
end $$;
rollback;

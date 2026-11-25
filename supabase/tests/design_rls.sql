begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
select ('60000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'visual-sql-'||i||'@example.test','{"full_name":"Visual SQL fixture"}',now() from generate_series(1,8)i;
create temporary table visual_context(event_id uuid,asset_id uuid);
grant select,insert on visual_context to authenticated,anon;
set local role authenticated;
do $$ declare ev uuid;begin
  perform set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  ev:=public.create_event('Visual SQL event','visual-sql-event','other',now()+interval '10 days');
  perform public.update_event(ev,'Visual SQL event','visual-sql-event','other',now()+interval '10 days','America/Asuncion',now()+interval '9 days','active');
  insert into visual_context values(ev,public.reserve_invitation_asset(ev,'SQL photograph'));
end $$;
reset role;
insert into public.event_members(event_id,user_id,role) select c.event_id,('60000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,(array['manager','invitations','content','moderator','checkin','viewer'])[i-1]::public.event_role from visual_context c cross join generate_series(2,7)i;
update public.event_invitation_assets set status='ready',width=100,height=100,bytes=100 where id=(select asset_id from visual_context);
do $$ begin
  if (select count(*) from pg_class where oid in ('public.event_invitation_designs'::regclass,'public.event_invitation_assets'::regclass) and relrowsecurity)<>2 then raise exception 'Visual tables must enforce RLS';end if;
  if has_function_privilege('authenticated','public.complete_invitation_asset(uuid,integer,integer,integer)','execute') or has_function_privilege('anon','private.validate_invitation_design(jsonb)','execute') then raise exception 'Privileged image validation exposed';end if;
  if (select public from storage.buckets where id='event-assets') then raise exception 'Event photos cannot use a public bucket';end if;
end $$;
set local role authenticated;
do $$ declare c record;draft jsonb;revision integer:=0;i integer;begin
  select * into c from visual_context;
  draft:=jsonb_build_object('version',1,'template','minimal','palette','olive','font_pair','classic','names','SQL visual invitation','eyebrow','','welcome','','show_guest_name',true,'closing','','dress_code','','details','','cover_asset_id',c.asset_id,'cover_focus','center','gallery','[]'::jsonb,'schedule','[]'::jsonb,'sections',(select jsonb_agg(jsonb_build_object('id',id,'enabled',true)) from unnest(array['welcome','countdown','schedule','dress','gallery','details','rsvp','closing']) id));
  for i in 1..8 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','60000000-0000-4000-8000-'||lpad(i::text,12,'0'),'role','authenticated')::text,true);
    if i in (1,2,4) then revision:=public.save_invitation_design(c.event_id,draft,revision);
    else begin perform public.save_invitation_design(c.event_id,draft,revision);raise exception 'Restricted role edited visual design';exception when insufficient_privilege then null;end;end if;
    if (select count(*) from public.event_invitation_assets where event_id=c.event_id)<>(case when i in (1,2,4) then 1 else 0 end) then raise exception 'Photo metadata isolation failed';end if;
    if (select count(*) from public.event_invitation_designs where event_id=c.event_id)<>(case when i in (1,2,4) then 1 else 0 end) then raise exception 'Draft isolation failed';end if;
    if i not in (1,2) then begin perform public.publish_invitation_design(c.event_id,revision);raise exception 'Restricted role published visual design';exception when insufficient_privilege then null;end;end if;
    begin update public.event_invitation_designs set published='{}'::jsonb;raise exception 'Direct publication allowed';exception when insufficient_privilege then null;end;
    begin update public.event_invitation_assets set status='ready';raise exception 'Direct validation allowed';exception when insufficient_privilege then null;end;
  end loop;
  perform set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  perform public.publish_invitation_design(c.event_id,revision);
  begin perform public.remove_invitation_asset(c.event_id,c.asset_id);raise exception 'Published photo removed';exception when invalid_parameter_value then null;end;
end $$;
set local role anon;
do $$ begin
  perform set_config('request.jwt.claims','{}',true);
  begin perform id from public.event_invitation_designs;raise exception 'Anonymous draft read allowed';exception when insufficient_privilege then null;end;
  begin perform id from public.event_invitation_assets;raise exception 'Anonymous asset metadata allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;

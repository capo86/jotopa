begin;
create index audit_projection_actor_time_idx on public.audit_log(actor_id,created_at) where action='wall.projection_issued';
do $migration$
declare definition text;target text:='secret_value:=encode(extensions.gen_random_bytes(32),''hex'');';
begin
  definition:=pg_get_functiondef('public.issue_wall_projection_access(uuid,timestamptz)'::regprocedure);
  if strpos(definition,target)=0 then raise exception 'projection_issuance_patch_target_missing';end if;
  execute replace(definition,target,'perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,73427005));
    if (select count(*) from public.audit_log where actor_id=auth.uid() and action=''wall.projection_issued'' and created_at>clock_timestamp()-interval ''1 hour'')>=20 then raise exception ''projection_link_limit'' using errcode=''54000'';end if;
    '||target);
end;
$migration$;

create function private.wall_notify_access_change() returns trigger language plpgsql security definer set search_path='' as $$
declare event_uuid uuid:=coalesce(new.event_id,old.event_id);
begin
  if exists(select 1 from public.events where id=event_uuid and deleted_at is null) then perform private.wall_notify(event_uuid);end if;
  return null;
end;
$$;
create trigger wall_notify_membership after insert or update or delete on public.event_members for each row execute function private.wall_notify_access_change();
create trigger wall_notify_projection_deletion after delete on private.wall_projection_access for each row execute function private.wall_notify_access_change();
revoke all on function private.wall_notify_access_change() from public,anon,authenticated;
commit;

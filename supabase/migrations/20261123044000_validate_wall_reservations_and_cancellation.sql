begin;
-- Reject undersized reservations as committed JSON failures rather than table
-- constraint exceptions, and audit a guest's first cancellation of a draft.
do $migration$
declare definition text; original text;
begin
  definition:=pg_get_functiondef('public.guest_wall(text,jsonb)'::regprocedure);
  original:='slot_value:=(p_request->>''slot'')::integer; byte_value:=(p_request->>''byte_count'')::integer;';
  if strpos(definition,original)=0 then raise exception 'wall_reservation_patch_target_missing';end if;
  definition:=replace(definition,original,original||' if byte_value<16 then return jsonb_build_object(''ok'',false,''code'',''invalid_media''); end if;');
  original:='update public.wall_posts set status=''deleted'',body='''',participant_name=null,author_name=''Publicación eliminada'' where id=p.id;';
  if strpos(definition,original)=0 then raise exception 'wall_cancel_patch_target_missing';end if;
  definition:=replace(definition,original,'if p.status<>''deleted'' then insert into public.audit_log(event_id,action,target,meta) values(p.event_id,''wall.draft_cancelled'',p.id,''{}''); end if; '||original);
  execute definition;
end;
$migration$;
commit;

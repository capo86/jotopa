begin;
-- Both operators are in PostgreSQL's user-defined precedence class. Bind the
-- JSON array explicitly, so containment never runs against the request object.
do $migration$
declare definition text; original text:='to_jsonb(w.id::text)<@p_request->''post_ids''';
begin
  definition:=pg_get_functiondef('public.guest_wall(text,jsonb)'::regprocedure);
  if strpos(definition,original)=0 then raise exception 'wall_manifest_patch_target_missing';end if;
  execute replace(definition,original,'to_jsonb(w.id::text)<@(p_request->''post_ids'')');
end;
$migration$;
commit;

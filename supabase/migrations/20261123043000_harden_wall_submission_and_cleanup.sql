begin;
-- Recheck the current audio setting at finalization, including a setting change
-- between binary attestation and submission. Keep deletion retries useful even
-- if a previously in-flight upload finishes after Storage removal.
do $migration$
declare definition text; original text;
begin
  definition:=pg_get_functiondef('public.guest_wall(text,jsonb)'::regprocedure);
  original:='if p.status<>''draft'' or (select count(*) from public.wall_post_media where post_id=p.id and kind=''photo'' and state=''ready'')';
  if strpos(definition,original)=0 then raise exception 'wall_submit_patch_target_missing';end if;
  execute replace(definition,original,'if p.status<>''draft'' or exists(select 1 from public.wall_post_media where post_id=p.id and kind=''audio'' and duration_seconds>coalesce(s.audio_max_seconds,60)) or (select count(*) from public.wall_post_media where post_id=p.id and kind=''photo'' and state=''ready'')');
  definition:=pg_get_functiondef('public.delete_wall_post(uuid)'::regprocedure);
  original:='where post_id=p.id and state<>''deleted''';
  if strpos(definition,original)=0 then raise exception 'wall_purge_patch_target_missing';end if;
  execute replace(definition,original,'where post_id=p.id');
end;
$migration$;
commit;

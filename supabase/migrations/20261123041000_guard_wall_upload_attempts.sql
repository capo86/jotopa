begin;
-- Charge even malformed binary submissions before inspecting their bytes.
create function public.check_wall_upload(p_token text,p_post_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare gate jsonb;g public.guests;e public.events;s public.event_wall_settings;
begin
  gate:=public.guest_invitation(p_token,'{"action":"read"}');
  if not coalesce((gate->>'ok')::boolean,false) then return gate;end if;
  select * into g from public.guests where invite_token=p_token;
  gate:=private.take_invitation_limit('wall_upload',g.id::text,g.id,12);
  if not (gate->>'allowed')::boolean then return jsonb_build_object('ok',false,'code','rate_limited');end if;
  select * into e from public.events where id=g.event_id;
  select * into s from public.event_wall_settings where event_id=g.event_id;
  if not exists(select 1 from public.wall_posts where id=p_post_id and guest_id=g.id and event_id=g.event_id and status='draft') then return jsonb_build_object('ok',false,'code','post_unavailable');end if;
  if not coalesce(s.enabled,true) or clock_timestamp()<coalesce(s.opens_at,e.session_opens_at) or clock_timestamp()>=coalesce(s.closes_at,e.session_closes_at) then return jsonb_build_object('ok',false,'code','wall_closed');end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.check_wall_upload(text,uuid) from public,anon,authenticated;
grant execute on function public.check_wall_upload(text,uuid) to anon,authenticated;
commit;

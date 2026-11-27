begin;

-- Share previews expose only event information. They never mark an invitation as opened.
create function public.invitation_share_preview(p_token text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'title', e.title,
    'starts_at', e.starts_at,
    'timezone', e.timezone
  )
  from public.guests g
  join public.events e on e.id = g.event_id
  where p_token ~ '^[a-f0-9]{64}$'
    and g.invite_token = p_token
    and e.deleted_at is null
    and e.status = 'active'
    and clock_timestamp() >= e.session_opens_at
    and clock_timestamp() < e.session_closes_at
  limit 1
$$;

revoke all on function public.invitation_share_preview(text) from public;
grant execute on function public.invitation_share_preview(text) to anon, authenticated;

commit;
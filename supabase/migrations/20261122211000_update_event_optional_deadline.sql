-- Omitted deadlines explicitly clear the optional RSVP date. Defaults also make
-- the generated RPC types accurately usable without handwritten nullable casts.
create or replace function public.update_event(p_event_id uuid, p_title text, p_slug text, p_type public.event_type, p_starts_at timestamptz, p_timezone text, p_rsvp_deadline timestamptz default null, p_status public.event_status default 'draft')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.events where id = p_event_id for update;
  if not public.has_event_permission(p_event_id,'event.update') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.events set title=p_title,slug=p_slug,type=p_type,starts_at=p_starts_at,timezone=p_timezone,rsvp_deadline=p_rsvp_deadline,status=p_status,
    session_closes_at=greatest(p_starts_at + interval '2 days', session_opens_at + interval '1 day') where id=p_event_id;
end;
$$;

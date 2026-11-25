begin;
create function private.invitation_section_enabled(p_design jsonb,p_section text)
returns boolean language sql immutable set search_path='' as $$
  select exists(select 1 from jsonb_array_elements(p_design->'sections') s where s->>'id'=p_section and s->'enabled'='true'::jsonb);
$$;
create function private.public_invitation_design(p_event_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select published || jsonb_build_object(
    'welcome',case when private.invitation_section_enabled(published,'welcome') then published->>'welcome' else '' end,
    'dress_code',case when private.invitation_section_enabled(published,'dress') then published->>'dress_code' else '' end,
    'details',case when private.invitation_section_enabled(published,'details') then published->>'details' else '' end,
    'closing',case when private.invitation_section_enabled(published,'closing') then published->>'closing' else '' end,
    'gallery',case when private.invitation_section_enabled(published,'gallery') then published->'gallery' else '[]'::jsonb end,
    'schedule',case when private.invitation_section_enabled(published,'schedule') then published->'schedule' else '[]'::jsonb end
  ) from public.event_invitation_designs where event_id=p_event_id and published is not null;
$$;
create or replace function private.invitation_snapshot(p_guest public.guests,p_event public.events)
returns jsonb language sql volatile set search_path='' as $$
  select jsonb_build_object('ok',true,'server_time',clock_timestamp(),
    'event',jsonb_build_object('title',p_event.title,'type',p_event.type,'starts_at',p_event.starts_at,'timezone',p_event.timezone,'rsvp_deadline',p_event.rsvp_deadline,'session_closes_at',p_event.session_closes_at),
    'guest',jsonb_build_object('full_name',p_guest.full_name,'companions_allowed',p_guest.companions_allowed,'companions_confirmed',p_guest.companions_confirmed,'rsvp_status',p_guest.rsvp_status,'rsvp_at',p_guest.rsvp_at,'opted_out',p_guest.opted_out,'version',p_guest.rsvp_version),
    'can_respond',p_event.rsvp_deadline is null or clock_timestamp()<p_event.rsvp_deadline,
    'presentation',private.public_invitation_design(p_event.id));
$$;
revoke all on function private.invitation_section_enabled(jsonb,text),private.public_invitation_design(uuid) from public,anon,authenticated;
commit;

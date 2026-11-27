begin;

create or replace function private.invitation_message_payload(p_guest public.guests,p_event public.events,p_template_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare template_row public.message_templates;
begin
  select * into template_row from public.message_templates where id=p_template_id and event_id=p_event.id and archived_at is null;
  if template_row.id is null then raise exception 'template_unavailable' using errcode='22023';end if;
  return jsonb_build_object('guest_id',p_guest.id,'full_name',p_guest.full_name,'phone',p_guest.phone,'token',p_guest.invite_token,'party_size',p_guest.party_size,'body',template_row.body,'location_label',template_row.location_label,
    'starts_at',p_event.starts_at,'timezone',p_event.timezone,'rsvp_deadline',coalesce(p_event.rsvp_deadline,p_event.session_closes_at));
end;
$$;

commit;
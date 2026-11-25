-- Keep event -> guest -> per-guest limit lock order. Expired counters reset
-- in place; foreign keys remove per-guest counters on deletion. State is bounded
-- to 64 global buckets plus at most two rows per guest, without cross-event
-- cleanup locks during a public invitation request.
begin;
create or replace function public.guest_invitation(p_token text,p_request jsonb default '{"action":"read"}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare guest_row public.guests; event_row public.events; guest_uuid uuid; event_uuid uuid;
  gate jsonb; action_name text; response_name text; companion_count integer; expected_version integer; checked_at timestamptz;
begin
  perform set_config('response.headers','[{"Cache-Control":"no-store"},{"Referrer-Policy":"no-referrer"}]',true);
  if coalesce(current_setting('request.method',true),'POST') not in ('','POST') then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  gate:=private.take_invitation_limit('global',(get_byte(extensions.digest(left(coalesce(p_token,''),128),'sha256'),0)%64)::text,null,120);
  if not (gate->>'allowed')::boolean then return jsonb_build_object('ok',false,'code','rate_limited','retry_after',gate->'retry_after'); end if;
  if p_token is null or octet_length(p_token)<>64 or p_token !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','invitation_unavailable'); end if;
  select id,event_id into guest_uuid,event_uuid from public.guests where invite_token=p_token;
  if guest_uuid is null then return jsonb_build_object('ok',false,'code','invitation_unavailable'); end if;
  -- Lock order matches management/import: event first, guest second. Recheck
  -- token and real clock after locks, including concurrent link rotation.
  select * into event_row from public.events where id=event_uuid for share;
  select * into guest_row from public.guests where id=guest_uuid and invite_token=p_token for update;
  checked_at:=clock_timestamp();
  if guest_row.id is null or event_row.deleted_at is not null or event_row.status<>'active' or checked_at<event_row.session_opens_at or checked_at>=event_row.session_closes_at then return jsonb_build_object('ok',false,'code','invitation_unavailable'); end if;
  action_name:=p_request->>'action';
  gate:=private.take_invitation_limit(case when action_name='read' then 'read' else 'write' end,guest_uuid::text,guest_uuid,case when action_name='read' then 30 else 6 end);
  if not (gate->>'allowed')::boolean then return jsonb_build_object('ok',false,'code','rate_limited','retry_after',gate->'retry_after'); end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>1024 then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  if action_name in ('read','opt_out') then
    if exists(select 1 from jsonb_object_keys(p_request) k where k<>'action') then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
    if action_name='opt_out' and not guest_row.opted_out then
      update public.guests set opted_out=true where id=guest_uuid returning * into guest_row;
    end if;
    return private.invitation_snapshot(guest_row,event_row);
  end if;
  if action_name is distinct from 'respond' or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','response','companions','expected_version')) then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  if event_row.rsvp_deadline is not null and clock_timestamp()>=event_row.rsvp_deadline then return jsonb_build_object('ok',false,'code','rsvp_closed'); end if;
  response_name:=p_request->>'response';
  if response_name is null or response_name not in ('yes','no','maybe') or jsonb_typeof(p_request->'response')<>'string'
    or jsonb_typeof(p_request->'companions') is distinct from 'number' or p_request->>'companions' !~ '^[0-9]{1,2}$'
    or jsonb_typeof(p_request->'expected_version') is distinct from 'number' or p_request->>'expected_version' !~ '^[0-9]{1,9}$' then return jsonb_build_object('ok',false,'code','invalid_response'); end if;
  companion_count:=(p_request->>'companions')::integer;
  expected_version:=(p_request->>'expected_version')::integer;
  if companion_count>guest_row.companions_allowed or (response_name<>'yes' and companion_count<>0) then return jsonb_build_object('ok',false,'code','invalid_companions'); end if;
  -- Exact retries are idempotent and preserve the original timestamp/version.
  if guest_row.rsvp_status::text=response_name and guest_row.companions_confirmed=companion_count then return private.invitation_snapshot(guest_row,event_row); end if;
  if guest_row.rsvp_version<>expected_version then return jsonb_build_object('ok',false,'code','response_changed'); end if;
  update public.guests set rsvp_status=response_name::public.guest_rsvp_status,companions_confirmed=companion_count,rsvp_at=clock_timestamp(),rsvp_version=rsvp_version+1
    where id=guest_uuid returning * into guest_row;
  return private.invitation_snapshot(guest_row,event_row);
end;
$$;

commit;

begin;

create unique index event_member_invites_one_pending_email_idx
on public.event_member_invites(event_id,email) where accepted_at is null and revoked_at is null;

create or replace function public.create_event_member_invite(p_event_id uuid,p_email text,p_role public.event_role)
returns table(invite_id uuid,token text) language plpgsql security definer set search_path='' as $$
declare raw_token text; invitation_id uuid; normalized_email text:=lower(btrim(p_email));
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'members.manage') or (public.get_my_event_role(p_event_id)='manager' and p_role='owner') then raise exception 'forbidden' using errcode='42501'; end if;
  -- Parent locks serialize each event. The profile lock additionally serializes
  -- this issuer across different events before checking the global hourly cap.
  perform 1 from public.profiles where user_id=auth.uid() for update;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.event_members m join auth.users u on u.id=m.user_id where m.event_id=p_event_id and lower(u.email)=normalized_email) then raise exception 'already_member' using errcode='23505'; end if;
  if (select count(*) from public.event_member_invites where created_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'invite_rate_limit' using errcode='P0001'; end if;
  update public.event_member_invites set revoked_at=now() where event_id=p_event_id and email=normalized_email and accepted_at is null and revoked_at is null;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.event_member_invites(event_id,email,role,token_hash,created_by,expires_at)
    values(p_event_id,normalized_email,p_role,encode(extensions.digest(raw_token,'sha256'),'hex'),auth.uid(),now()+interval '7 days') returning id into invitation_id;
  return query select invitation_id,raw_token;
end;
$$;

commit;

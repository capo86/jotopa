begin;

create type public.event_role as enum ('owner', 'manager', 'invitations', 'content', 'moderator', 'checkin', 'viewer');
create type public.event_status as enum ('draft', 'active', 'closed');
create type public.event_type as enum ('wedding', 'birthday', 'anniversary', 'other');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  type public.event_type not null,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  slug text not null unique check (char_length(slug) between 3 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  starts_at timestamptz not null,
  timezone text not null default 'America/Asuncion',
  rsvp_deadline timestamptz check (rsvp_deadline <= starts_at),
  hashtag text,
  theme jsonb not null default '{}'::jsonb,
  session_opens_at timestamptz not null default now(),
  session_closes_at timestamptz not null,
  status public.event_status not null default 'draft',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (session_closes_at > session_opens_at)
);
create index events_created_by_idx on public.events(created_by);
create index events_status_starts_at_idx on public.events(status, starts_at) where deleted_at is null;

create table public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.event_role not null,
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);
create index event_members_user_id_idx on public.event_members(user_id);
create index event_members_event_role_idx on public.event_members(event_id, role);

create table public.event_member_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role public.event_role not null,
  token_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index event_member_invites_event_id_idx on public.event_member_invites(event_id);
create index event_member_invites_created_by_idx on public.event_member_invites(created_by, created_at);
create index event_member_invites_accepted_by_idx on public.event_member_invites(accepted_by);
create index event_member_invites_pending_idx on public.event_member_invites(event_id, expires_at) where accepted_at is null and revoked_at is null;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target uuid not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_event_created_idx on public.audit_log(event_id, created_at desc);
create index audit_log_actor_id_idx on public.audit_log(actor_id);

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.event_member_invites enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.events, public.event_members, public.event_member_invites, public.audit_log from anon, authenticated;
grant select on public.events, public.event_members, public.audit_log to authenticated;
-- The token hash is not readable through the Data API, even by the inviter.
grant select (id,event_id,email,role,created_by,expires_at,accepted_at,accepted_by,revoked_at,created_at) on public.event_member_invites to authenticated;

create function public.event_role_permissions(p_role public.event_role)
returns text[] language sql immutable set search_path = '' as $$
  select case p_role
    when 'owner' then array['event.read','event.update','event.delete','event.transfer','members.manage','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read','content.write','wall.moderate','checkin.write','audit.read']
    when 'manager' then array['event.read','event.update','members.manage','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read','content.write','wall.moderate','checkin.write','audit.read']
    when 'invitations' then array['event.read','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read']
    when 'content' then array['event.read','content.write']
    when 'moderator' then array['event.read','wall.moderate']
    when 'checkin' then array['event.read','checkin.write']
    when 'viewer' then array['event.read','dashboard.read']
    else array[]::text[] end;
$$;

create function public.get_my_event_role(p_event_id uuid)
returns public.event_role language sql stable security definer set search_path = '' as $$
  select case when exists(select 1 from public.profiles where user_id = (select auth.uid()) and platform_role = 'super_admin')
    then 'owner'::public.event_role
    else (select role from public.event_members where event_id = p_event_id and user_id = (select auth.uid())) end
  where auth.uid() is not null and exists(select 1 from public.events where id = p_event_id);
$$;

create function public.has_event_permission(event_id uuid, permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.uid() is not null
    and permission = any(public.event_role_permissions(public.get_my_event_role(event_id)))
    and exists(select 1 from public.events e where e.id = event_id and (e.deleted_at is null or permission = 'audit.read')), false);
$$;

create policy events_read on public.events for select to authenticated using (public.has_event_permission(id, 'event.read'));
create policy event_members_read on public.event_members for select to authenticated using (
  public.has_event_permission(event_id, 'event.read') and (user_id = (select auth.uid()) or public.has_event_permission(event_id, 'members.manage'))
);
create policy event_member_invites_read on public.event_member_invites for select to authenticated using (public.has_event_permission(event_id, 'members.manage'));
create policy audit_log_read on public.audit_log for select to authenticated using (public.has_event_permission(event_id, 'audit.read'));

create function public.validate_event_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  new.title := btrim(new.title);
  new.updated_at := now();
  return new;
end;
$$;
create trigger validate_event_fields before insert or update on public.events for each row execute function public.validate_event_fields();

create function public.audit_event_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare action_name text; target_id uuid; event_uuid uuid; details jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'events' then
    event_uuid := new.id; target_id := new.id;
    if tg_op = 'INSERT' then action_name := 'event.created';
    elsif old.deleted_at is null and new.deleted_at is not null then action_name := 'event.deleted';
    else action_name := 'event.updated'; end if;
  elsif tg_table_name = 'event_members' then
    event_uuid := coalesce(new.event_id, old.event_id); target_id := coalesce(new.id, old.id);
    action_name := case tg_op when 'INSERT' then 'member.added' when 'UPDATE' then 'member.role_changed' else 'member.removed' end;
    details := jsonb_build_object('user_id', coalesce(new.user_id, old.user_id), 'old_role', case when tg_op <> 'INSERT' then old.role else null end, 'new_role', case when tg_op <> 'DELETE' then new.role else null end);
  else
    event_uuid := new.event_id; target_id := new.id;
    action_name := case when tg_op = 'INSERT' then 'invite.created' when old.accepted_at is null and new.accepted_at is not null then 'invite.accepted' else 'invite.revoked' end;
    details := jsonb_build_object('role', new.role);
  end if;
  -- No contact fields, message bodies or invitation tokens enter the audit log.
  if exists(select 1 from public.events where id = event_uuid) then
    insert into public.audit_log(event_id, actor_id, action, target, meta) values (event_uuid, auth.uid(), action_name, target_id, details);
  end if;
  return coalesce(new, old);
end;
$$;
create trigger events_audit after insert or update on public.events for each row execute function public.audit_event_changes();
create trigger event_members_audit after insert or update or delete on public.event_members for each row execute function public.audit_event_changes();
create trigger event_member_invites_audit after insert or update on public.event_member_invites for each row execute function public.audit_event_changes();

create function public.protect_last_event_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- All normal membership RPCs lock this same parent first. This also protects
  -- trusted administrative DML and serializes concurrent owner removals.
  perform 1 from public.events where id = old.event_id for update;
  if found and old.role = 'owner' and not exists(select 1 from public.event_members where event_id = old.event_id and role = 'owner') then
    raise exception 'last_owner' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger event_members_keep_owner after update or delete on public.event_members
  deferrable initially immediate for each row execute function public.protect_last_event_owner();

create function public.create_event(p_title text, p_slug text, p_type public.event_type, p_starts_at timestamptz, p_timezone text default 'America/Asuncion', p_rsvp_deadline timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_event uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where user_id = auth.uid() and platform_role in ('organizer','super_admin')) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.events(created_by,title,slug,type,starts_at,timezone,rsvp_deadline,session_closes_at)
    values(auth.uid(),p_title,p_slug,p_type,p_starts_at,p_timezone,p_rsvp_deadline,greatest(p_starts_at + interval '2 days', now() + interval '1 day')) returning id into new_event;
  insert into public.event_members(event_id,user_id,role) values(new_event,auth.uid(),'owner');
  return new_event;
end;
$$;

create function public.update_event(p_event_id uuid, p_title text, p_slug text, p_type public.event_type, p_starts_at timestamptz, p_timezone text, p_rsvp_deadline timestamptz, p_status public.event_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.events where id = p_event_id for update;
  if not public.has_event_permission(p_event_id,'event.update') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.events set title=p_title,slug=p_slug,type=p_type,starts_at=p_starts_at,timezone=p_timezone,rsvp_deadline=p_rsvp_deadline,status=p_status,
    session_closes_at=greatest(p_starts_at + interval '2 days', session_opens_at + interval '1 day') where id=p_event_id;
end;
$$;

create function public.delete_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'event.delete') then raise exception 'forbidden' using errcode = '42501'; end if;
  -- Soft deletion retains immutable client-visible audit history.
  update public.events set deleted_at=now(),status='closed' where id=p_event_id;
  update public.event_member_invites set revoked_at=now() where event_id=p_event_id and accepted_at is null and revoked_at is null;
end;
$$;

create function public.change_event_member_role(p_event_id uuid, p_user_id uuid, p_role public.event_role)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role public.event_role; actor_role public.event_role;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'members.manage') or p_user_id=auth.uid() then raise exception 'forbidden' using errcode='42501'; end if;
  actor_role:=public.get_my_event_role(p_event_id);
  select role into target_role from public.event_members where event_id=p_event_id and user_id=p_user_id;
  if target_role is null then raise exception 'member_not_found' using errcode='22023'; end if;
  if actor_role='manager' and (target_role='owner' or p_role='owner') then raise exception 'forbidden' using errcode='42501'; end if;
  update public.event_members set role=p_role where event_id=p_event_id and user_id=p_user_id and role<>p_role;
  update public.event_member_invites set revoked_at=now() where event_id=p_event_id and created_by=p_user_id and accepted_at is null and revoked_at is null;
end;
$$;

create function public.remove_event_member(p_event_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role public.event_role;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'members.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select role into target_role from public.event_members where event_id=p_event_id and user_id=p_user_id;
  if target_role is null then raise exception 'member_not_found' using errcode='22023'; end if;
  if public.get_my_event_role(p_event_id)='manager' and target_role='owner' then raise exception 'forbidden' using errcode='42501'; end if;
  delete from public.event_members where event_id=p_event_id and user_id=p_user_id;
  update public.event_member_invites set revoked_at=now() where event_id=p_event_id and created_by=p_user_id and accepted_at is null and revoked_at is null;
end;
$$;

create function public.list_event_team(p_event_id uuid)
returns table(id uuid,user_id uuid,full_name text,role public.event_role) language plpgsql security definer set search_path='' as $$
begin
  if not public.has_event_permission(p_event_id,'members.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  return query select m.id,m.user_id,p.full_name,m.role from public.event_members m join public.profiles p on p.user_id=m.user_id where m.event_id=p_event_id order by m.created_at,m.id;
end;
$$;

create function public.create_event_member_invite(p_event_id uuid,p_email text,p_role public.event_role)
returns table(invite_id uuid,token text) language plpgsql security definer set search_path='' as $$
declare raw_token text; invitation_id uuid; normalized_email text:=lower(btrim(p_email));
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'members.manage') or (public.get_my_event_role(p_event_id)='manager' and p_role='owner') then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.event_members m join auth.users u on u.id=m.user_id where m.event_id=p_event_id and lower(u.email)=normalized_email) then raise exception 'already_member' using errcode='23505'; end if;
  if (select count(*) from public.event_member_invites where created_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'invite_rate_limit' using errcode='P0001'; end if;
  update public.event_member_invites set revoked_at=now() where event_id=p_event_id and email=normalized_email and accepted_at is null and revoked_at is null;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.event_member_invites(event_id,email,role,token_hash,created_by,expires_at)
    values(p_event_id,normalized_email,p_role,encode(extensions.digest(raw_token,'sha256'),'hex'),auth.uid(),now()+interval '7 days') returning id into invitation_id;
  return query select invitation_id,raw_token;
end;
$$;

create function public.revoke_event_member_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare invitation public.event_member_invites;
begin
  select * into invitation from public.event_member_invites where id=p_invite_id;
  perform 1 from public.events where id=invitation.event_id for update;
  if not public.has_event_permission(invitation.event_id,'members.manage') or (public.get_my_event_role(invitation.event_id)='manager' and invitation.role='owner') then raise exception 'forbidden' using errcode='42501'; end if;
  update public.event_member_invites set revoked_at=now() where id=p_invite_id and accepted_at is null and revoked_at is null;
end;
$$;

-- Shared validation does not reveal invite details to another account. It is
-- internal only; callers cannot bypass expiry/email/issuer-role checks.
create function public.valid_event_member_invite(p_token text)
returns public.event_member_invites language plpgsql security definer set search_path='' as $$
declare invitation public.event_member_invites; user_email text;
begin
  if auth.uid() is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invite_unavailable' using errcode='P0001'; end if;
  select * into invitation from public.event_member_invites where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  perform 1 from public.events where id=invitation.event_id for update;
  select * into invitation from public.event_member_invites where id=invitation.id for update;
  select lower(email) into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if invitation.id is null or invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at<=clock_timestamp() or user_email is null or user_email<>invitation.email
    or not exists(select 1 from public.events where id=invitation.event_id and deleted_at is null)
    or not exists(select 1 from public.event_members where event_id=invitation.event_id and user_id=invitation.created_by and role in ('owner','manager') and (role='owner' or invitation.role<>'owner'))
    then raise exception 'invite_unavailable' using errcode='P0001'; end if;
  return invitation;
end;
$$;

create function public.preview_event_member_invite(p_token text)
returns table(event_title text,role public.event_role,expires_at timestamptz) language plpgsql security definer set search_path='' as $$
declare invitation public.event_member_invites;
begin
  invitation:=public.valid_event_member_invite(p_token);
  return query select e.title,invitation.role,invitation.expires_at from public.events e where e.id=invitation.event_id;
end;
$$;

create function public.accept_event_member_invite(p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.event_member_invites;
begin
  invitation:=public.valid_event_member_invite(p_token);
  if exists(select 1 from public.event_members where event_id=invitation.event_id and user_id=auth.uid()) then raise exception 'already_member' using errcode='23505'; end if;
  insert into public.event_members(event_id,user_id,role) values(invitation.event_id,auth.uid(),invitation.role);
  update public.event_member_invites set accepted_at=now(),accepted_by=auth.uid() where id=invitation.id;
  return invitation.event_id;
end;
$$;

-- No function gets an implicit PUBLIC execution grant. Only the listed API
-- functions can be called by a signed-in user. All privileged helpers stay private.
revoke all on function public.event_role_permissions(public.event_role),public.get_my_event_role(uuid),public.has_event_permission(uuid,text),public.validate_event_fields(),public.audit_event_changes(),public.protect_last_event_owner(),public.create_event(text,text,public.event_type,timestamptz,text,timestamptz),public.update_event(uuid,text,text,public.event_type,timestamptz,text,timestamptz,public.event_status),public.delete_event(uuid),public.change_event_member_role(uuid,uuid,public.event_role),public.remove_event_member(uuid,uuid),public.list_event_team(uuid),public.create_event_member_invite(uuid,text,public.event_role),public.revoke_event_member_invite(uuid),public.valid_event_member_invite(text),public.preview_event_member_invite(text),public.accept_event_member_invite(text) from public,anon,authenticated;
grant execute on function public.event_role_permissions(public.event_role),public.get_my_event_role(uuid),public.has_event_permission(uuid,text),public.create_event(text,text,public.event_type,timestamptz,text,timestamptz),public.update_event(uuid,text,text,public.event_type,timestamptz,text,timestamptz,public.event_status),public.delete_event(uuid),public.change_event_member_role(uuid,uuid,public.event_role),public.remove_event_member(uuid,uuid),public.list_event_team(uuid),public.create_event_member_invite(uuid,text,public.event_role),public.revoke_event_member_invite(uuid),public.preview_event_member_invite(text),public.accept_event_member_invite(text) to authenticated;

commit;

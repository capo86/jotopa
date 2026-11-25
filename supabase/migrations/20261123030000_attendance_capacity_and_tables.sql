-- Stage B: preserve personal invitations and legacy storage, count whole parties.
begin;

create table private.legacy_maybe_responses (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references public.guests(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  original_status text not null check(original_status='maybe'),
  original_rsvp_at timestamptz,
  original_version integer not null,
  original_companions integer not null,
  created_at timestamptz not null default clock_timestamp()
);
create index legacy_maybe_event_idx on private.legacy_maybe_responses(event_id);
alter table private.legacy_maybe_responses enable row level security;
revoke all on private.legacy_maybe_responses from public,anon,authenticated;
create policy legacy_maybe_deny_clients on private.legacy_maybe_responses for all to anon,authenticated using(false) with check(false);
insert into private.legacy_maybe_responses(guest_id,event_id,original_status,original_rsvp_at,original_version,original_companions)
select id,event_id,rsvp_status::text,rsvp_at,rsvp_version,companions_confirmed from public.guests where rsvp_status='maybe';
update public.guests set rsvp_status='pending',rsvp_at=null,companions_confirmed=0,rsvp_version=rsvp_version+1 where rsvp_status='maybe';
select private.sync_guest_invitation(guest_id) from private.legacy_maybe_responses;
insert into public.audit_log(event_id,action,target,meta)
select event_id,'guest.legacy_maybe_migrated',guest_id,jsonb_build_object('previous_response','maybe','response','pending','previous_version',original_version) from private.legacy_maybe_responses;
-- Retain the enum label for immutable historical JSON; forbid it in current rows.
alter table public.guests add constraint guests_binary_rsvp check(rsvp_status in ('pending','yes','no'));
alter table public.guests add constraint guests_no_nonattending_companions check(rsvp_status='yes' or companions_confirmed=0);
alter table public.guests add column party_size integer generated always as (companions_allowed+1) stored;
alter table public.guests add column attending_count integer generated always as (case when rsvp_status='yes' then companions_confirmed+1 else 0 end) stored;
grant select(party_size,attending_count,table_id) on public.guests to authenticated;

insert into public.audit_log(event_id,action,target,meta)
select id,'event.rsvp_deadline_defaulted',id,'{"source":"event_start"}' from public.events where rsvp_deadline is null;
update public.events set rsvp_deadline=starts_at where rsvp_deadline is null;
alter table public.events alter column rsvp_deadline set not null;
alter table public.events add column tables_visible boolean not null default false;
create function private.enforce_event_deadline()
returns trigger language plpgsql set search_path='' as $$
begin
  -- Legacy creation calls omit the optional argument: use the event start,
  -- never an unbounded response period. Explicit updates cannot clear it.
  if new.rsvp_deadline is null and tg_op='INSERT' then new.rsvp_deadline:=new.starts_at;end if;
  if new.rsvp_deadline is null or not isfinite(new.rsvp_deadline) or not isfinite(new.starts_at) or new.rsvp_deadline>new.starts_at then raise exception 'invalid_deadline' using errcode='22023';end if;
  return new;
end;
$$;
create trigger events_required_deadline before insert or update on public.events for each row execute function private.enforce_event_deadline();

-- Wrap the existing normalizer, preserving legacy imports and reconciliation.
alter function public.normalize_guest_input(jsonb,boolean) rename to normalize_guest_input_v1;
alter function public.normalize_guest_input_v1(jsonb,boolean) set schema private;
create function public.normalize_guest_input(p_data jsonb,p_import boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare normalized jsonb:=p_data;size_value integer;
begin
  if p_data ? 'party_size' then
    if p_data->>'party_size' is not null then
      if jsonb_typeof(p_data->'party_size')<>'number' or p_data->>'party_size' !~ '^[0-9]{1,2}$' then raise exception 'invalid_party_size' using errcode='22023';end if;
      size_value:=(p_data->>'party_size')::integer;
      if size_value not between 1 and 21 then raise exception 'invalid_party_size' using errcode='22023';end if;
      if p_data->>'companions_allowed' is not null and p_data->'companions_allowed'<>to_jsonb(size_value-1) then raise exception 'conflicting_capacity' using errcode='22023';end if;
      normalized:=(p_data-'party_size')||jsonb_build_object('companions_allowed',size_value-1);
    else normalized:=p_data-'party_size';end if;
  end if;
  return private.normalize_guest_input_v1(normalized,p_import);
end;
$$;

create table public.event_tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,event_id)
);
create unique index event_tables_event_name_idx on public.event_tables(event_id,lower(btrim(name)));
alter table public.event_tables enable row level security;
revoke all on public.event_tables from public,anon,authenticated;
grant select on public.event_tables to authenticated;
create policy event_tables_read on public.event_tables for select to authenticated using(public.has_event_permission(event_id,'tables.read'));
-- The existing pointer assigns the entire party. Future per-person placements
-- can reference this table without duplicating today's assignment source.
alter table public.guests add constraint guests_table_event_fk foreign key(table_id,event_id) references public.event_tables(id,event_id);

create function private.audit_table_changes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='event_tables' then
    insert into public.audit_log(event_id,actor_id,action,target)
    values(coalesce(new.event_id,old.event_id),auth.uid(),case tg_op when 'INSERT' then 'table.created' when 'UPDATE' then 'table.updated' else 'table.deleted' end,coalesce(new.id,old.id));
  elsif new.table_id is distinct from old.table_id then
    insert into public.audit_log(event_id,actor_id,action,target,meta)
    values(new.event_id,auth.uid(),'guest.table_assigned',new.id,jsonb_build_object('previous_table_id',old.table_id,'table_id',new.table_id));
  end if;
  return coalesce(new,old);
end;
$$;
create trigger event_tables_audit after insert or update or delete on public.event_tables for each row execute function private.audit_table_changes();
create trigger guests_table_audit after update of table_id on public.guests for each row execute function private.audit_table_changes();

create function public.save_event_table(p_event_id uuid,p_name text,p_table_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'tables.write') then raise exception 'forbidden' using errcode='42501';end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'invalid_table' using errcode='22023';end if;
  if p_table_id is null then
    if (select count(*) from public.event_tables where event_id=p_event_id)>=500 then raise exception 'table_limit' using errcode='22023';end if;
    insert into public.event_tables(event_id,name) values(p_event_id,btrim(p_name)) returning id into saved_id;
  else
    update public.event_tables set name=btrim(p_name),updated_at=clock_timestamp() where id=p_table_id and event_id=p_event_id returning id into saved_id;
    if saved_id is null then raise exception 'table_unavailable' using errcode='22023';end if;
  end if;
  return saved_id;
exception when unique_violation then raise exception 'table_duplicate' using errcode='23505',detail='';
end;
$$;
create function public.delete_event_table(p_event_id uuid,p_table_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'tables.write') then raise exception 'forbidden' using errcode='42501';end if;
  if exists(select 1 from public.guests where event_id=p_event_id and table_id=p_table_id) then raise exception 'table_in_use' using errcode='22023';end if;
  delete from public.event_tables where id=p_table_id and event_id=p_event_id;
  if not found then raise exception 'table_unavailable' using errcode='22023';end if;
end;
$$;
create function public.configure_table_visibility(p_event_id uuid,p_visible boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'tables.publish') then raise exception 'forbidden' using errcode='42501';end if;
  if p_visible is null then raise exception 'invalid_table' using errcode='22023';end if;
  update public.events set tables_visible=p_visible where id=p_event_id and tables_visible<>p_visible;
  if found then insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'tables.visibility_changed',p_event_id,jsonb_build_object('visible',p_visible));end if;
end;
$$;
create function private.set_guest_table(p_event_id uuid,p_guest_id uuid,p_table_id uuid)
returns void language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.guests where id=p_guest_id and event_id=p_event_id) then raise exception 'guest_unavailable' using errcode='22023';end if;
  if p_table_id is not null and not exists(select 1 from public.event_tables where id=p_table_id and event_id=p_event_id) then raise exception 'table_unavailable' using errcode='22023';end if;
  update public.guests set table_id=p_table_id where id=p_guest_id and event_id=p_event_id and table_id is distinct from p_table_id;
end;
$$;
create function public.assign_guest_table(p_event_id uuid,p_guest_id uuid,p_table_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'tables.assign') then raise exception 'forbidden' using errcode='42501';end if;
  perform private.set_guest_table(p_event_id,p_guest_id,p_table_id);
end;
$$;

create function public.list_event_tables(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.has_event_permission(p_event_id,'tables.assign') and not public.has_event_permission(p_event_id,'tables.write') then raise exception 'forbidden' using errcode='42501';end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by lower(t.name),t.id) from (
    select t.id,t.name,count(g.id)::integer as invitations,coalesce(sum(g.party_size),0)::integer as authorized_people,coalesce(sum(g.attending_count),0)::integer as confirmed_people
    from public.event_tables t left join public.guests g on g.table_id=t.id and g.event_id=t.event_id where t.event_id=p_event_id group by t.id
  ) t),'[]'::jsonb);
end;
$$;
create function public.list_seating_guests(p_event_id uuid,p_search text default '',p_table text default 'all',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_event_permission(p_event_id,'tables.assign') then raise exception 'forbidden' using errcode='42501';end if;
  if p_page is null or p_page not between 0 and 100000 or p_search is null or char_length(p_search)>160 or p_table is null or (p_table not in ('all','unassigned') and p_table !~ '^[a-f0-9-]{36}$') then raise exception 'invalid_filters' using errcode='22023';end if;
  with filtered as materialized (
    select g.id,g.full_name,g.party_size,g.attending_count,g.rsvp_status,g.table_id,t.name as table_name from public.guests g
    left join public.event_tables t on t.id=g.table_id and t.event_id=g.event_id
    where g.event_id=p_event_id and (p_search='' or strpos(lower(g.full_name),lower(p_search))>0)
      and (p_table='all' or (p_table='unassigned' and g.table_id is null) or g.table_id::text=p_table)
  ), paged as (select * from filtered order by lower(full_name),id limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb)) into result;
  return result;
end;
$$;
create function public.event_attendance_summary(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.has_event_permission(p_event_id,'dashboard.read') then raise exception 'forbidden' using errcode='42501';end if;
  return (select jsonb_build_object('invitations',count(*),'authorized_people',coalesce(sum(party_size),0),'confirmed_invitations',count(*) filter(where rsvp_status='yes'),'confirmed_people',coalesce(sum(attending_count),0),'declined_invitations',count(*) filter(where rsvp_status='no'),'pending_invitations',count(*) filter(where rsvp_status='pending'),'assigned_people',coalesce(sum(attending_count) filter(where table_id is not null),0),
    'total_tables',(select count(*) from public.event_tables where event_id=p_event_id),'available_tables',(select count(*) from public.event_tables t where t.event_id=p_event_id and not exists(select 1 from public.guests g where g.event_id=p_event_id and g.table_id=t.id))) from public.guests where event_id=p_event_id);
end;
$$;

create unique index audit_seating_import_batch_idx on public.audit_log(event_id,target) where action='tables.imported';
create function public.import_table_assignments(p_event_id uuid,p_rows jsonb,p_batch_id uuid,p_preview boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;data jsonb;normalized jsonb;resolved jsonb:='[]';report jsonb:='[]';previous jsonb;input_hash text;reason text;ids uuid[];guest_uuid uuid;table_uuid uuid;row_no integer;assigned integer:=0;rejected integer:=0;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'tables.assign') then raise exception 'forbidden' using errcode='42501';end if;
  -- Contact reconciliation is privileged; content editors import only opaque
  -- invitation IDs from their contact-free assignment template.
  if p_batch_id is null or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>1000000 or p_preview is null then raise exception 'invalid_import' using errcode='22023';end if;
  input_hash:=encode(extensions.digest(p_rows::text,'sha256'),'hex');
  select meta into previous from public.audit_log where event_id=p_event_id and target=p_batch_id and action='tables.imported';
  if found then
    if previous->>'input_hash'<>input_hash then raise exception 'import_batch_conflict' using errcode='22023';end if;
    return previous->'report'||jsonb_build_object('replayed',true);
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    reason:=null;guest_uuid:=null;table_uuid:=null;data:=item->'data';
    if jsonb_typeof(item->'row_number') is distinct from 'number' or item->>'row_number' !~ '^[0-9]{1,6}$' then raise exception 'invalid_import' using errcode='22023';end if;
    row_no:=(item->>'row_number')::integer;
    begin
      if data is null or jsonb_typeof(data)<>'object' or exists(select 1 from jsonb_object_keys(data) k where k not in ('guest_id','email','phone','document_id','table_name')) or jsonb_typeof(data->'table_name') is distinct from 'string' or char_length(data->>'table_name')>80 then raise exception 'invalid_assignment' using errcode='22023';end if;
      if not public.has_event_permission(p_event_id,'guests.contact_read') and exists(select 1 from jsonb_each(data) d where d.key in ('email','phone','document_id') and d.value not in ('null'::jsonb,'""'::jsonb)) then raise exception 'contact_not_authorized' using errcode='22023';end if;
      normalized:=public.normalize_guest_input((data-'guest_id'-'table_name')||'{"full_name":"Assignment"}',true);
      select array_agg(id) into ids from public.guests where event_id=p_event_id and ((normalized->>'email' is not null and email=normalized->>'email') or (normalized->>'phone' is not null and phone=normalized->>'phone') or (normalized->>'document_id' is not null and document_id=normalized->>'document_id'));
      if data->>'guest_id' is not null and data->>'guest_id'<>'' then
        if jsonb_typeof(data->'guest_id')<>'string' or data->>'guest_id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'invalid_assignment' using errcode='22023';end if;
        guest_uuid:=(data->>'guest_id')::uuid;
        if not exists(select 1 from public.guests where id=guest_uuid and event_id=p_event_id) then raise exception 'guest_unavailable' using errcode='22023';end if;
        if coalesce(cardinality(ids),0)>0 and (cardinality(ids)<>1 or ids[1]<>guest_uuid) then raise exception 'identity_conflict' using errcode='22023';end if;
      else
        if coalesce(cardinality(ids),0)=0 then raise exception 'guest_unavailable' using errcode='22023';end if;
        if cardinality(ids)<>1 then raise exception 'identity_conflict' using errcode='22023';end if;
        guest_uuid:=ids[1];
      end if;
      if btrim(data->>'table_name')<>'' then
        select id into table_uuid from public.event_tables where event_id=p_event_id and lower(btrim(name))=lower(btrim(data->>'table_name'));
        if table_uuid is null then raise exception 'table_unavailable' using errcode='22023';end if;
      end if;
    exception when sqlstate '22023' then get stacked diagnostics reason=message_text;end;
    resolved:=resolved||jsonb_build_array(jsonb_build_object('row_number',row_no,'guest_id',guest_uuid,'table_id',table_uuid,'reason',reason));
  end loop;
  if exists(select 1 from jsonb_array_elements(resolved) r group by r->>'row_number' having count(*)>1) then raise exception 'invalid_import' using errcode='22023';end if;
  begin
    for item in select value from jsonb_array_elements(resolved) loop
      reason:=item->>'reason';
      if reason is null and (select count(*) from jsonb_array_elements(resolved) r where r->>'guest_id'=item->>'guest_id' and r->>'reason' is null)>1 then reason:='target_repeated';end if;
      if reason is null then
        perform private.set_guest_table(p_event_id,(item->>'guest_id')::uuid,(item->>'table_id')::uuid);
        assigned:=assigned+1;
      else rejected:=rejected+1;end if;
      report:=report||jsonb_build_array(jsonb_build_object('row_number',item->'row_number','status',case when reason is null then 'assigned' else 'rejected' end,'reason',reason));
    end loop;
    report:=jsonb_build_object('assigned',assigned,'rejected',rejected,'rows',report);
    if p_preview then raise exception 'preview_rollback' using errcode='Z0002';end if;
    insert into public.audit_log(event_id,actor_id,action,target,meta) values(p_event_id,auth.uid(),'tables.imported',p_batch_id,jsonb_build_object('input_hash',input_hash,'report',report));
  exception when sqlstate 'Z0002' then null;end;
  return report||jsonb_build_object('replayed',false);
end;
$$;

revoke all on function private.enforce_event_deadline(),private.normalize_guest_input_v1(jsonb,boolean),public.normalize_guest_input(jsonb,boolean),private.audit_table_changes(),private.set_guest_table(uuid,uuid,uuid),public.save_event_table(uuid,text,uuid),public.delete_event_table(uuid,uuid),public.configure_table_visibility(uuid,boolean),public.assign_guest_table(uuid,uuid,uuid),public.list_event_tables(uuid),public.list_seating_guests(uuid,text,text,integer),public.event_attendance_summary(uuid),public.import_table_assignments(uuid,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.save_event_table(uuid,text,uuid),public.delete_event_table(uuid,uuid),public.configure_table_visibility(uuid,boolean),public.assign_guest_table(uuid,uuid,uuid),public.list_event_tables(uuid),public.list_seating_guests(uuid,text,text,integer),public.event_attendance_summary(uuid),public.import_table_assignments(uuid,jsonb,uuid,boolean) to authenticated;

-- Updated permission matrix, personal projection and RSVP implementation follow.

create or replace function public.event_role_permissions(p_role public.event_role)
returns text[] language sql immutable set search_path = '' as $$
  select case p_role
    when 'owner' then array['tables.read','tables.write','tables.assign','tables.publish','event.read','event.update','event.delete','event.transfer','members.manage','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read','content.write','wall.moderate','checkin.write','audit.read']
    when 'manager' then array['tables.read','tables.write','tables.assign','tables.publish','event.read','event.update','members.manage','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read','content.write','wall.moderate','checkin.write','audit.read']
    when 'invitations' then array['tables.read','tables.assign','event.read','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read']
    when 'content' then array['tables.read','tables.write','tables.assign','event.read','content.write']
    when 'moderator' then array['event.read','wall.moderate']
    when 'checkin' then array['tables.read','event.read','checkin.write']
    when 'viewer' then array['event.read','dashboard.read']
    else array[]::text[] end;
$$;


create or replace function public.list_guests(p_event_id uuid,p_search text default '',p_group text default '',p_contact text default 'all',p_page integer default 0,p_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; full_access boolean;
begin
  full_access:=public.has_event_permission(p_event_id,'guests.read') and public.has_event_permission(p_event_id,'guests.contact_read');
  if not full_access and not public.has_event_permission(p_event_id,'checkin.write') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_page is null or p_page<0 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 100 or char_length(coalesce(p_search,''))>160 or char_length(coalesce(p_group,''))>80 or p_contact is null or p_contact not in ('all','with_contact','without_contact') then raise exception 'invalid_filters' using errcode='22023'; end if;
  if not full_access and (coalesce(p_group,'')<>'' or p_contact<>'all') then raise exception 'forbidden' using errcode='42501'; end if;
  if full_access then
    with filtered as materialized (
      select id,event_id,full_name,email,phone,document_id,group_label,companions_allowed,contact_consent,created_at,updated_at,rsvp_status,rsvp_at,companions_confirmed,opted_out,rsvp_version,party_size,attending_count,table_id,(select name from public.event_tables t where t.id=guests.table_id and t.event_id=guests.event_id) as table_name
      from public.guests where event_id=p_event_id
        and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',full_name,email,phone,document_id,group_label)),lower(p_search))>0)
        and (coalesce(p_group,'')='' or group_label=p_group)
        and (p_contact='all' or (p_contact='with_contact' and (email is not null or phone is not null)) or (p_contact='without_contact' and email is null and phone is null))
    ), paged as (select * from filtered order by lower(full_name),id limit p_page_size offset p_page*p_page_size)
    select jsonb_build_object('scope','full','total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
      'groups',coalesce((select jsonb_agg(group_label order by group_label) from (select distinct group_label from public.guests where event_id=p_event_id and group_label is not null) groups),'[]'::jsonb)) into result;
  else
    with filtered as materialized (select id,event_id,full_name,table_id,(select name from public.event_tables t where t.id=guests.table_id and t.event_id=guests.event_id) as table_name from public.guests where event_id=p_event_id and (coalesce(p_search,'')='' or strpos(lower(full_name),lower(p_search))>0)),
      paged as (select * from filtered order by lower(full_name),id limit p_page_size offset p_page*p_page_size)
    select jsonb_build_object('scope','roster','total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'groups','[]'::jsonb) into result;
  end if;
  return result;
end;
$$;


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
    if exists(select 1 from jsonb_object_keys(p_request) k where k<>'action' and not(action_name='read' and k='visit_id')) then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
    if action_name='read' and p_request ? 'visit_id' then
      if jsonb_typeof(p_request->'visit_id') is distinct from 'string' or p_request->>'visit_id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
      perform private.record_invitation_open(guest_uuid,(p_request->>'visit_id')::uuid);
    end if;
    if action_name='opt_out' and not guest_row.opted_out then
      update public.guests set opted_out=true where id=guest_uuid returning * into guest_row;
    end if;
    return private.invitation_snapshot(guest_row,event_row);
  end if;
  if action_name is distinct from 'respond' or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','response','companions','attending_count','expected_version')) then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
  if event_row.rsvp_deadline is not null and clock_timestamp()>=event_row.rsvp_deadline then return jsonb_build_object('ok',false,'code','rsvp_closed'); end if;
  response_name:=p_request->>'response';
  if response_name is null or response_name not in ('yes','no') or jsonb_typeof(p_request->'response')<>'string'
    or jsonb_typeof(p_request->'expected_version') is distinct from 'number' or p_request->>'expected_version' !~ '^[0-9]{1,9}$' then return jsonb_build_object('ok',false,'code','invalid_response'); end if;
  if p_request ? 'attending_count' then
    if jsonb_typeof(p_request->'attending_count') is distinct from 'number' or p_request->>'attending_count' !~ '^[0-9]{1,2}$' then return jsonb_build_object('ok',false,'code','invalid_response');end if;
    if (response_name='yes' and (p_request->>'attending_count')::integer not between 1 and guest_row.party_size) or (response_name='no' and (p_request->>'attending_count')::integer<>0) then return jsonb_build_object('ok',false,'code','invalid_attendance');end if;
    companion_count:=case when response_name='yes' then (p_request->>'attending_count')::integer-1 else 0 end;
    if p_request ? 'companions' and p_request->'companions'<>to_jsonb(companion_count) then return jsonb_build_object('ok',false,'code','invalid_response');end if;
  else
    if jsonb_typeof(p_request->'companions') is distinct from 'number' or p_request->>'companions' !~ '^[0-9]{1,2}$' then return jsonb_build_object('ok',false,'code','invalid_response');end if;
    companion_count:=(p_request->>'companions')::integer;
  end if;
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

create or replace function private.invitation_snapshot(p_guest public.guests,p_event public.events)
returns jsonb language sql volatile set search_path='' as $$
  select jsonb_build_object('ok',true,'server_time',clock_timestamp(),
    'event',jsonb_build_object('title',p_event.title,'type',p_event.type,'starts_at',p_event.starts_at,'timezone',p_event.timezone,'rsvp_deadline',p_event.rsvp_deadline,'session_closes_at',p_event.session_closes_at),
    'guest',jsonb_build_object('full_name',p_guest.full_name,'companions_allowed',p_guest.companions_allowed,'companions_confirmed',p_guest.companions_confirmed,'party_size',p_guest.party_size,'attending_count',p_guest.attending_count,'rsvp_status',p_guest.rsvp_status,'rsvp_at',p_guest.rsvp_at,'opted_out',p_guest.opted_out,'version',p_guest.rsvp_version,
      'table_name',case when p_event.tables_visible then (select name from public.event_tables where id=p_guest.table_id and event_id=p_event.id) else null end),
    'can_respond',clock_timestamp()<p_event.rsvp_deadline,
    'presentation',private.public_invitation_design(p_event.id));
$$;
commit;

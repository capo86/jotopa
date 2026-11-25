begin;

create type public.guest_rsvp_status as enum ('pending','yes','no','maybe');
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  email text check (email=lower(btrim(email)) and char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text check (phone=public.normalize_guest_phone(phone)),
  document_id text check (document_id ~ '^[A-Z0-9]{3,40}$'),
  group_label text check (char_length(group_label)<=80),
  table_id uuid,
  -- Reserved for the personal invitation phase; no token is issued in 2A.
  invite_token text unique check (invite_token ~ '^[a-f0-9]{64}$'),
  companions_allowed integer not null default 0 check (companions_allowed between 0 and 20),
  companions_confirmed integer not null default 0 check (companions_confirmed between 0 and companions_allowed),
  rsvp_status public.guest_rsvp_status not null default 'pending',
  rsvp_at timestamptz,
  dietary_notes text,
  contact_consent boolean not null default false,
  opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index guests_event_email_key on public.guests(event_id,email) where email is not null;
create unique index guests_event_phone_key on public.guests(event_id,phone) where phone is not null;
create unique index guests_event_document_key on public.guests(event_id,document_id) where document_id is not null;
create index guests_event_name_idx on public.guests(event_id,lower(full_name),id);
create index guests_event_group_idx on public.guests(event_id,group_label);
create index guests_event_rsvp_idx on public.guests(event_id,rsvp_status);
create index guests_table_id_idx on public.guests(table_id) where table_id is not null;
alter table public.guests enable row level security;
revoke all on public.guests from public,anon,authenticated;
grant select (id,event_id,full_name,email,phone,document_id,group_label,companions_allowed,contact_consent,created_at,updated_at) on public.guests to authenticated;
create policy guests_contact_read on public.guests for select to authenticated
  using (public.has_event_permission(event_id,'guests.read') and public.has_event_permission(event_id,'guests.contact_read'));

-- The deliberate projection enforces the checkin role's name/table-only access
-- in SQL, never by fetching contact data and hiding it in React.
create view public.guest_roster with (security_barrier=true,security_invoker=false) as
  select id,event_id,full_name,table_id from public.guests
  where public.has_event_permission(event_id,'checkin.write') or public.has_event_permission(event_id,'guests.read');
revoke all on public.guest_roster from public,anon,authenticated;
grant select on public.guest_roster to authenticated;

create function public.normalize_guest_input(p_data jsonb,p_import boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare name_value text; email_value text; phone_value text; document_value text; group_value text;
  companions_value integer; consent_value boolean;
begin
  if jsonb_typeof(p_data)<>'object' or p_data is null or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('full_name','email','phone','document_id','group_label','companions_allowed','contact_consent')) then raise exception 'invalid_guest' using errcode='22023'; end if;
  if jsonb_typeof(p_data->'full_name')<>'string' or p_data->>'full_name' is null then raise exception 'invalid_name' using errcode='22023'; end if;
  name_value:=btrim(p_data->>'full_name');
  if char_length(name_value) not between 2 and 160 then raise exception 'invalid_name' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(p_data) item where item.key in ('email','phone','document_id','group_label') and jsonb_typeof(item.value) not in ('string','null')) then raise exception 'invalid_guest' using errcode='22023'; end if;
  email_value:=nullif(lower(btrim(p_data->>'email')),'');
  if email_value is not null and (char_length(email_value)>254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'invalid_email' using errcode='22023'; end if;
  phone_value:=public.normalize_guest_phone(p_data->>'phone');
  document_value:=nullif(upper(btrim(p_data->>'document_id')),'');
  if document_value is not null then
    if document_value !~ '^[A-Z0-9 .-]+$' then raise exception 'invalid_document' using errcode='22023'; end if;
    document_value:=regexp_replace(document_value,'[ .-]','','g');
    if char_length(document_value) not between 3 and 40 then raise exception 'invalid_document' using errcode='22023'; end if;
  end if;
  group_value:=nullif(btrim(p_data->>'group_label'),'');
  if char_length(group_value)>80 then raise exception 'invalid_group' using errcode='22023'; end if;
  if p_data->>'companions_allowed' is not null then
    if jsonb_typeof(p_data->'companions_allowed')<>'number' or p_data->>'companions_allowed' !~ '^[0-9]{1,2}$' then raise exception 'invalid_companions' using errcode='22023'; end if;
    companions_value:=(p_data->>'companions_allowed')::integer;
    if companions_value>20 then raise exception 'invalid_companions' using errcode='22023'; end if;
  elsif not p_import then companions_value:=0; end if;
  if p_data->>'contact_consent' is not null then
    if jsonb_typeof(p_data->'contact_consent')<>'boolean' then raise exception 'invalid_consent' using errcode='22023'; end if;
    consent_value:=(p_data->>'contact_consent')::boolean;
  elsif not p_import then consent_value:=false; end if;
  return jsonb_build_object('full_name',name_value,'email',email_value,'phone',phone_value,'document_id',document_value,'group_label',group_value,'companions_allowed',companions_value,'contact_consent',consent_value);
end;
$$;

create function public.audit_guest_changes()
returns trigger language plpgsql security definer set search_path='' as $$
declare event_uuid uuid:=coalesce(new.event_id,old.event_id);
begin
  if tg_op<>'DELETE' then new.updated_at:=now(); end if;
  if exists(select 1 from public.events where id=event_uuid) then
    insert into public.audit_log(event_id,actor_id,action,target,meta)
    values(event_uuid,auth.uid(),case tg_op when 'INSERT' then 'guest.created' when 'UPDATE' then 'guest.updated' else 'guest.deleted' end,coalesce(new.id,old.id),'{}'::jsonb);
  end if;
  return coalesce(new,old);
end;
$$;
create trigger guests_audit before insert or update or delete on public.guests for each row execute function public.audit_guest_changes();

create function public.save_guest(p_event_id uuid,p_data jsonb,p_guest_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare normalized jsonb; saved_id uuid;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'guests.write') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501'; end if;
  normalized:=public.normalize_guest_input(p_data,false);
  if p_guest_id is null then
    insert into public.guests(event_id,full_name,email,phone,document_id,group_label,companions_allowed,contact_consent)
    values(p_event_id,normalized->>'full_name',normalized->>'email',normalized->>'phone',normalized->>'document_id',normalized->>'group_label',(normalized->>'companions_allowed')::integer,(normalized->>'contact_consent')::boolean) returning id into saved_id;
  else
    update public.guests set full_name=normalized->>'full_name',email=normalized->>'email',phone=normalized->>'phone',document_id=normalized->>'document_id',group_label=normalized->>'group_label',companions_allowed=(normalized->>'companions_allowed')::integer,contact_consent=(normalized->>'contact_consent')::boolean
    where id=p_guest_id and event_id=p_event_id returning id into saved_id;
    if saved_id is null then raise exception 'guest_unavailable' using errcode='22023'; end if;
  end if;
  return saved_id;
exception
  when unique_violation then raise exception 'guest_duplicate' using errcode='23505',detail='';
  when check_violation then raise exception 'invalid_guest' using errcode='22023',detail='';
end;
$$;

create function public.delete_guest(p_event_id uuid,p_guest_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'guests.write') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501'; end if;
  delete from public.guests where event_id=p_event_id and id=p_guest_id;
  if not found then raise exception 'guest_unavailable' using errcode='22023'; end if;
end;
$$;

create function public.list_guests(p_event_id uuid,p_search text default '',p_group text default '',p_contact text default 'all',p_page integer default 0,p_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; full_access boolean;
begin
  full_access:=public.has_event_permission(p_event_id,'guests.read') and public.has_event_permission(p_event_id,'guests.contact_read');
  if not full_access and not public.has_event_permission(p_event_id,'checkin.write') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_page is null or p_page<0 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 100 or char_length(coalesce(p_search,''))>160 or char_length(coalesce(p_group,''))>80 or p_contact is null or p_contact not in ('all','with_contact','without_contact') then raise exception 'invalid_filters' using errcode='22023'; end if;
  if not full_access and (coalesce(p_group,'')<>'' or p_contact<>'all') then raise exception 'forbidden' using errcode='42501'; end if;
  if full_access then
    with filtered as materialized (
      select id,event_id,full_name,email,phone,document_id,group_label,companions_allowed,contact_consent,created_at,updated_at
      from public.guests where event_id=p_event_id
        and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',full_name,email,phone,document_id,group_label)),lower(p_search))>0)
        and (coalesce(p_group,'')='' or group_label=p_group)
        and (p_contact='all' or (p_contact='with_contact' and (email is not null or phone is not null)) or (p_contact='without_contact' and email is null and phone is null))
    ), paged as (select * from filtered order by lower(full_name),id limit p_page_size offset p_page*p_page_size)
    select jsonb_build_object('scope','full','total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
      'groups',coalesce((select jsonb_agg(group_label order by group_label) from (select distinct group_label from public.guests where event_id=p_event_id and group_label is not null) groups),'[]'::jsonb)) into result;
  else
    with filtered as materialized (select id,event_id,full_name,table_id from public.guests where event_id=p_event_id and (coalesce(p_search,'')='' or strpos(lower(full_name),lower(p_search))>0)),
      paged as (select * from filtered order by lower(full_name),id limit p_page_size offset p_page*p_page_size)
    select jsonb_build_object('scope','roster','total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'groups','[]'::jsonb) into result;
  end if;
  return result;
end;
$$;

create function public.prepare_guest_import(p_rows jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare item jsonb; normalized jsonb; prepared jsonb:='[]'; result jsonb:='[]'; row_no integer; ordinal integer:=1; reason text;
begin
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>1000000 then raise exception 'invalid_import' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    ordinal:=ordinal+1;
    row_no:=ordinal;
    if item->>'row_number' is not null then
      if jsonb_typeof(item->'row_number')<>'number' or item->>'row_number' !~ '^[0-9]{1,6}$' then raise exception 'invalid_import' using errcode='22023'; end if;
      row_no:=(item->>'row_number')::integer;
    end if;
    begin
      normalized:=public.normalize_guest_input(item->'data',true);
      prepared:=prepared||jsonb_build_array(jsonb_build_object('row_number',row_no,'data',normalized));
    exception when sqlstate '22023' then
      get stacked diagnostics reason=message_text;
      prepared:=prepared||jsonb_build_array(jsonb_build_object('row_number',row_no,'reason',reason));
    end;
  end loop;
  if exists(select 1 from jsonb_array_elements(prepared) r group by r->>'row_number' having count(*)>1) then raise exception 'invalid_import' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(prepared) loop
    if not item ? 'reason' and exists(select 1 from jsonb_array_elements(prepared) other where not other ? 'reason' and other->>'row_number'<>item->>'row_number' and (
      (item->'data'->>'email' is not null and item->'data'->>'email'=other->'data'->>'email') or
      (item->'data'->>'phone' is not null and item->'data'->>'phone'=other->'data'->>'phone') or
      (item->'data'->>'document_id' is not null and item->'data'->>'document_id'=other->'data'->>'document_id'))) then item:=item||jsonb_build_object('reason','file_duplicate'); end if;
    result:=result||jsonb_build_array(item);
  end loop;
  return result;
end;
$$;

create function public.apply_guest_import(p_event_id uuid,p_rows jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare prepared jsonb:=public.prepare_guest_import(p_rows); resolved jsonb:='[]'; report jsonb:='[]'; item jsonb; data jsonb; matches uuid[]; target_id uuid;
  created_count integer:=0; updated_count integer:=0; rejected_count integer:=0; reason text; action text;
begin
  for item in select value from jsonb_array_elements(prepared) loop
    if not item ? 'reason' then
      data:=item->'data';
      select array_agg(id) into matches from public.guests where event_id=p_event_id and ((data->>'email' is not null and email=data->>'email') or (data->>'phone' is not null and phone=data->>'phone') or (data->>'document_id' is not null and document_id=data->>'document_id'));
      if cardinality(matches)>1 then item:=item||jsonb_build_object('reason','identity_conflict');
      elsif cardinality(matches)=1 then item:=item||jsonb_build_object('target',matches[1]); end if;
    end if;
    resolved:=resolved||jsonb_build_array(item);
  end loop;
  for item in select value from jsonb_array_elements(resolved) loop
    reason:=item->>'reason'; target_id:=null; action:=null; data:=item->'data';
    if reason is null and item->>'target' is not null and (select count(*) from jsonb_array_elements(resolved) other where other->>'target'=item->>'target' and not other ? 'reason')>1 then reason:='target_repeated'; end if;
    if reason is null then
      begin
        if item->>'target' is null then
          insert into public.guests(event_id,full_name,email,phone,document_id,group_label,companions_allowed,contact_consent)
            values(p_event_id,data->>'full_name',data->>'email',data->>'phone',data->>'document_id',data->>'group_label',coalesce((data->>'companions_allowed')::integer,0),coalesce((data->>'contact_consent')::boolean,false)) returning id into target_id;
          action:='created';
        else
          target_id:=(item->>'target')::uuid;
          update public.guests set full_name=data->>'full_name',email=coalesce(data->>'email',email),phone=coalesce(data->>'phone',phone),document_id=coalesce(data->>'document_id',document_id),group_label=coalesce(data->>'group_label',group_label),companions_allowed=coalesce((data->>'companions_allowed')::integer,companions_allowed),contact_consent=coalesce((data->>'contact_consent')::boolean,contact_consent) where id=target_id and event_id=p_event_id;
          action:='updated';
        end if;
      exception when unique_violation then reason:='guest_duplicate'; when check_violation then reason:='invalid_guest'; end;
    end if;
    if reason is not null then
      rejected_count:=rejected_count+1;
      report:=report||jsonb_build_array(jsonb_build_object('row_number',item->'row_number','status','rejected','reason',reason));
    else
      if action='created' then created_count:=created_count+1; else updated_count:=updated_count+1; end if;
      report:=report||jsonb_build_array(jsonb_build_object('row_number',item->'row_number','status',action,'guest_id',target_id));
    end if;
  end loop;
  return jsonb_build_object('created',created_count,'updated',updated_count,'rejected',rejected_count,'rows',report);
end;
$$;

create unique index audit_guest_import_batch_idx on public.audit_log(event_id,target) where action='guests.imported';
create function public.import_guests(p_event_id uuid,p_rows jsonb,p_batch_id uuid,p_preview boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report jsonb; previous jsonb; input_hash text;
begin
  perform 1 from public.events where id=p_event_id for update;
  if not public.has_event_permission(p_event_id,'guests.write') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_batch_id is null then raise exception 'invalid_import' using errcode='22023'; end if;
  perform public.prepare_guest_import(p_rows);
  input_hash:=encode(extensions.digest(p_rows::text,'sha256'),'hex');
  select meta into previous from public.audit_log where event_id=p_event_id and target=p_batch_id and action='guests.imported';
  if found then
    if previous->>'input_hash'<>input_hash then raise exception 'import_batch_conflict' using errcode='22023'; end if;
    return previous->'report'||jsonb_build_object('replayed',true);
  end if;
  begin
    report:=public.apply_guest_import(p_event_id,p_rows);
    if p_preview then raise exception 'preview_rollback' using errcode='Z0001'; end if;
    insert into public.audit_log(event_id,actor_id,action,target,meta)
      values(p_event_id,auth.uid(),'guests.imported',p_batch_id,jsonb_build_object('input_hash',input_hash,'report',report));
  exception when sqlstate 'Z0001' then null; end;
  return report||jsonb_build_object('replayed',false);
end;
$$;

create function public.export_guests(p_event_id uuid,p_search text default '',p_group text default '',p_contact text default 'all')
returns jsonb language plpgsql security definer set search_path='' as $$
declare page jsonb; rows jsonb:='[]'; page_no integer:=0;
begin
  if not public.has_event_permission(p_event_id,'guests.read') or not public.has_event_permission(p_event_id,'guests.contact_read') then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.events where id=p_event_id for share;
  loop
    page:=public.list_guests(p_event_id,p_search,p_group,p_contact,page_no,100);
    if (page->>'total')::integer>10000 then raise exception 'export_limit' using errcode='22023'; end if;
    rows:=rows||(page->'rows');
    exit when jsonb_array_length(rows)>=(page->>'total')::integer;
    page_no:=page_no+1;
  end loop;
  return rows;
end;
$$;

revoke all on function public.normalize_guest_input(jsonb,boolean),public.audit_guest_changes(),public.save_guest(uuid,jsonb,uuid),public.delete_guest(uuid,uuid),public.list_guests(uuid,text,text,text,integer,integer),public.prepare_guest_import(jsonb),public.apply_guest_import(uuid,jsonb),public.import_guests(uuid,jsonb,uuid,boolean),public.export_guests(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.save_guest(uuid,jsonb,uuid),public.delete_guest(uuid,uuid),public.list_guests(uuid,text,text,text,integer,integer),public.import_guests(uuid,jsonb,uuid,boolean),public.export_guests(uuid,text,text,text) to authenticated;
commit;

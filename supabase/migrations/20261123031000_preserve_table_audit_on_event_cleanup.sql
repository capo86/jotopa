begin;
create or replace function private.audit_table_changes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Physical administrative event removal cascades to tables and guests. The
  -- deleted parent's audit also cascades, so do not recreate it during cleanup.
  if not exists(select 1 from public.events where id=coalesce(new.event_id,old.event_id)) then return coalesce(new,old);end if;
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
commit;

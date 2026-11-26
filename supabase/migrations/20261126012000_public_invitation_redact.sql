begin;
create or replace function public.public_invitation(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$ select null::jsonb; $$;
commit;

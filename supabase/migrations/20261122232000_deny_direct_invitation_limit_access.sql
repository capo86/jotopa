begin;
-- Explicit default-deny policy as defense in depth: client roles have neither
-- schema/table privileges nor a row policy authorizing access to limiter state.
-- Only the permission-scoped SECURITY DEFINER invitation API can use it.
create policy invitation_limits_deny_clients on private.invitation_rate_limits
  for all to anon,authenticated using (false) with check (false);
commit;

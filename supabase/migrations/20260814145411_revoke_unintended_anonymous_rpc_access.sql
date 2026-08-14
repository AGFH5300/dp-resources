-- Reduce the externally callable SECURITY DEFINER surface without changing
-- authenticated application behavior. Functions used by signed-in users retain
-- authenticated EXECUTE; server-only rate limiting is restricted to service_role.

revoke execute on function public.dp_admin_resource_usage_for_resource(text, text)
  from public, anon;
revoke execute on function public.dp_admin_resource_usage_for_user(uuid, text)
  from public, anon;
revoke execute on function public.dp_admin_resource_usage_leaderboard(text, integer)
  from public, anon;

revoke execute on function public.dp_resource_usage_start(text)
  from public, anon;
revoke execute on function public.dp_resource_usage_heartbeat(uuid, boolean)
  from public, anon;
revoke execute on function public.dp_resource_usage_end(uuid)
  from public, anon;

revoke execute on function public.dp_is_admin_member(uuid)
  from public, anon;
revoke execute on function public.dp_is_approved_member(uuid)
  from public, anon;
revoke execute on function public.dp_resources_is_admin()
  from public, anon;

-- Trigger functions are invoked by PostgreSQL triggers, not by API clients.
revoke execute on function public.dp_identity_enforce_auth_user()
  from public, anon, authenticated;
revoke execute on function public.dp_identity_enforce_profile()
  from public, anon, authenticated;

-- All application calls to this RPC use createSupabaseAdminClient(), so direct
-- anon/authenticated execution only lets clients manipulate shared rate buckets.
revoke execute on function public.dp_check_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.dp_check_rate_limit(text, text, integer, integer)
  to service_role;

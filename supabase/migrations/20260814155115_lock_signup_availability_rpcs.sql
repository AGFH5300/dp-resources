-- Keep signup availability/database policy RPCs behind the application's
-- rate-limited server routes. These SECURITY DEFINER functions do not need to
-- be directly callable through PostgREST by anon or normal authenticated users.

revoke execute on function public.dp_resource_email_domain_policy(text)
  from public, anon, authenticated;
revoke execute on function public.dp_resource_is_email_available(text)
  from public, anon, authenticated;
revoke execute on function public.dp_resource_is_username_available(text)
  from public, anon, authenticated;
revoke execute on function public.dp_resource_username_availability_status(text)
  from public, anon, authenticated;

grant execute on function public.dp_resource_email_domain_policy(text)
  to service_role, supabase_auth_admin;
grant execute on function public.dp_resource_is_email_available(text)
  to service_role;
grant execute on function public.dp_resource_is_username_available(text)
  to service_role;
grant execute on function public.dp_resource_username_availability_status(text)
  to service_role;

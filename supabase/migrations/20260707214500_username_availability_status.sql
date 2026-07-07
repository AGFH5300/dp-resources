create or replace function public.dp_resource_username_availability_status(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.dp_identity_validate_username(p_username) is not null then
    return 'invalid';
  end if;

  if exists (
    select 1
    from public.dp_resource_profiles
    where lower(username) = lower(trim(p_username))
  ) then
    return 'unavailable';
  end if;

  return 'available';
end;
$$;

revoke execute on function public.dp_resource_username_availability_status(text) from public;
grant execute on function public.dp_resource_username_availability_status(text) to anon, authenticated;

create or replace function public.dp_resource_is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.dp_resource_username_availability_status(p_username) = 'available'
$$;

revoke execute on function public.dp_resource_is_username_available(text) from public;
grant execute on function public.dp_resource_is_username_available(text) to anon, authenticated;

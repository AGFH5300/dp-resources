create or replace function public.dp_identity_local_part(p_email text)
returns text language sql immutable as $$ select split_part(coalesce(p_email,''), '@', 1) $$;

create or replace function public.dp_identity_compact(p_value text)
returns text language sql immutable as $$
  select translate(regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9]+', '', 'g'), '01345789', 'oieastbg')
$$;

create or replace function public.dp_identity_is_reserved_username(p_username text)
returns boolean language sql immutable as $$
  select public.dp_identity_compact(p_username) in ('admin','support','moderator','system','official','dpresources','dpresource','dpadmin','dpsupport','dpresourcesadmin','dpresourcesofficial')
$$;

create or replace function public.dp_identity_has_disallowed_text(p_value text)
returns boolean language sql immutable as $$
  select public.dp_identity_compact(p_value) ~ '(nigger|nigga|kike|chink|gook|spic|wetback|raghead|paki|coon|faggot|tranny|nazi|hitler|kkk|heilhitler|whitepower|aryanbrotherhood|isis|alqaeda|taliban|fuck|shit|bitch|cunt|whore|slut|dick|cock|pussy|porn|sex|cum|jizz|rape|rapist|kill|murder|terrorist|bomb|schoolshooter|massacre)'
$$;

create or replace function public.dp_identity_validate_username(p_username text)
returns text language plpgsql immutable as $$
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' or p_username ~ '^_' or p_username ~ '_$' or p_username like '%__%' then return 'invalid_format'; end if;
  if public.dp_identity_is_reserved_username(p_username) then return 'reserved_name'; end if;
  if public.dp_identity_has_disallowed_text(p_username) then return 'identity_not_allowed'; end if;
  return null;
end;
$$;

create or replace function public.dp_identity_validate_full_name(p_name text)
returns text language plpgsql immutable as $$
begin
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 120 then return 'invalid_format'; end if;
  if p_name ~* '(https?://|www\.|\S+@\S+\.\S+)' then return 'invalid_format'; end if;
  if p_name !~ '[[:alpha:]]' or p_name ~ '(.)\1{5,}' then return 'invalid_format'; end if;
  if public.dp_identity_has_disallowed_text(p_name) then return 'identity_not_allowed'; end if;
  return null;
end;
$$;

create or replace function public.dp_identity_validate_email_local_part(p_email text)
returns text language plpgsql immutable as $$
begin
  if p_email is null or position('@' in p_email) < 2 then return 'invalid_format'; end if;
  if public.dp_identity_has_disallowed_text(public.dp_identity_local_part(p_email)) then return 'identity_not_allowed'; end if;
  return null;
end;
$$;

create or replace function public.dp_identity_enforce_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare reason text;
begin
  reason := public.dp_identity_validate_username(new.raw_user_meta_data->>'username');
  if reason is not null then raise exception 'identity_not_allowed' using errcode = '23514'; end if;
  reason := public.dp_identity_validate_full_name(new.raw_user_meta_data->>'full_name');
  if reason is not null then raise exception 'identity_not_allowed' using errcode = '23514'; end if;
  reason := public.dp_identity_validate_email_local_part(new.email); -- dp_identity_local_part(new.email)
  if reason is not null then raise exception 'identity_not_allowed' using errcode = '23514'; end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'dp_identity_auth_users_enforce' and tgrelid = 'auth.users'::regclass) then
    create trigger dp_identity_auth_users_enforce
      before insert or update of email, raw_user_meta_data on auth.users
      for each row execute function public.dp_identity_enforce_auth_user();
  end if;
end;
$$;

create or replace function public.dp_identity_enforce_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare reason text;
begin
  reason := public.dp_identity_validate_username(new.username);
  if reason is not null then raise exception 'identity_not_allowed' using errcode = '23514'; end if;
  reason := public.dp_identity_validate_full_name(new.full_name);
  if reason is not null then raise exception 'identity_not_allowed' using errcode = '23514'; end if;
  reason := public.dp_identity_validate_email_local_part(new.email); -- dp_identity_local_part(new.email)
  if reason is not null then raise exception 'identity_not_allowed' using errcode = '23514'; end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'dp_identity_profiles_enforce' and tgrelid = 'public.dp_resource_profiles'::regclass) then
    create trigger dp_identity_profiles_enforce
      before insert or update of username, full_name, email on public.dp_resource_profiles
      for each row execute function public.dp_identity_enforce_profile();
  end if;
end;
$$;

create or replace function public.dp_identity_audit_existing()
returns table(user_id uuid, reason text) language sql stable security definer set search_path = public as $$
  select p.id, r.reason from public.dp_resource_profiles p
  cross join lateral (values (public.dp_identity_validate_username(p.username)), (public.dp_identity_validate_full_name(p.full_name)), (public.dp_identity_validate_email_local_part(p.email))) r(reason)
  where r.reason is not null and public.dp_resources_is_admin()
$$;

revoke execute on function public.dp_identity_audit_existing() from public, anon, authenticated;
grant execute on function public.dp_identity_audit_existing() to authenticated;

create or replace function public.dp_resource_is_username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.dp_identity_validate_username(p_username) is null and not exists (
    select 1 from public.dp_resource_profiles
    where lower(username) = lower(trim(p_username))
  )
$$;

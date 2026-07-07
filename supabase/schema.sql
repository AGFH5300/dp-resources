create extension if not exists pgcrypto;

create table if not exists public.dp_resource_memberships (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.dp_resource_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  file_id text,
  file_name text not null,
  action text not null check (action in ('folder_opened', 'file_opened', 'download_started')),
  created_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

create index if not exists dp_resource_memberships_email_idx on public.dp_resource_memberships (lower(email));
create index if not exists dp_resource_memberships_approval_idx on public.dp_resource_memberships (is_approved, created_at desc);
create index if not exists dp_resource_activity_user_date_idx on public.dp_resource_activity_logs (user_id, created_at desc);
create index if not exists dp_resource_activity_action_date_idx on public.dp_resource_activity_logs (action, created_at desc);
create index if not exists dp_resource_activity_file_id_idx on public.dp_resource_activity_logs (file_id);
create index if not exists dp_resource_activity_file_name_idx on public.dp_resource_activity_logs (lower(file_name));

create or replace function public.dp_resources_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dp_resource_memberships m
    where m.id = auth.uid()
      and m.role = 'admin'
      and m.is_approved = true
  )
$$;

revoke execute on function public.dp_resources_is_admin() from public, anon, authenticated;

create or replace function public.dp_resources_handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.dp_resource_memberships (id, email, role, is_approved)
  values (new.id, new.email, 'user', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.dp_resources_handle_new_user() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'dp_resources_on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger dp_resources_on_auth_user_created
      after insert on auth.users
      for each row execute function public.dp_resources_handle_new_user();
  end if;
end;
$$;

insert into public.dp_resource_memberships (id, email, role, is_approved)
select id, email, 'user', false
from auth.users
where email is not null
on conflict (id) do nothing;

alter table public.dp_resource_memberships enable row level security;
alter table public.dp_resource_activity_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_memberships' and policyname = 'dp resources users read own membership') then
    create policy "dp resources users read own membership" on public.dp_resource_memberships
      for select using (auth.uid() = id or public.dp_resources_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_memberships' and policyname = 'dp resources admins manage memberships') then
    create policy "dp resources admins manage memberships" on public.dp_resource_memberships
      for all using (public.dp_resources_is_admin()) with check (public.dp_resources_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_activity_logs' and policyname = 'dp resources users read own activity') then
    create policy "dp resources users read own activity" on public.dp_resource_activity_logs
      for select using (auth.uid() = user_id or public.dp_resources_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_activity_logs' and policyname = 'dp resources admins read all activity') then
    create policy "dp resources admins read all activity" on public.dp_resource_activity_logs
      for select using (public.dp_resources_is_admin());
  end if;
end;
$$;
create table if not exists public.dp_resource_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dp_resource_profiles_username_lower_key on public.dp_resource_profiles (lower(username));
create unique index if not exists dp_resource_profiles_email_lower_key on public.dp_resource_profiles (lower(email));

create or replace function public.dp_resource_profiles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'dp_resource_profiles_set_updated_at' and tgrelid = 'public.dp_resource_profiles'::regclass) then
    create trigger dp_resource_profiles_set_updated_at
      before update on public.dp_resource_profiles
      for each row execute function public.dp_resource_profiles_set_updated_at();
  end if;
end;
$$;

create or replace function public.dp_resource_is_username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.dp_resource_profiles
    where lower(username) = lower(trim(p_username))
  )
$$;

create or replace function public.dp_resource_is_email_available(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.dp_resource_profiles
    where lower(email) = lower(trim(p_email))
  )
$$;

revoke execute on function public.dp_resource_profiles_set_updated_at() from public, anon, authenticated;
grant execute on function public.dp_resource_is_username_available(text) to anon, authenticated;
grant execute on function public.dp_resource_is_email_available(text) to anon, authenticated;

alter table public.dp_resource_profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_profiles' and policyname = 'dp resources users read own profile') then
    create policy "dp resources users read own profile" on public.dp_resource_profiles
      for select using (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_profiles' and policyname = 'dp resources users insert own profile') then
    create policy "dp resources users insert own profile" on public.dp_resource_profiles
      for insert with check (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_profiles' and policyname = 'dp resources users update own profile') then
    create policy "dp resources users update own profile" on public.dp_resource_profiles
      for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end;
$$;

create table if not exists public.dp_resource_onboarding_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.dp_resource_onboarding_dismissals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_onboarding_dismissals' and policyname = 'onboarding users read own dismissals') then
    create policy "onboarding users read own dismissals" on public.dp_resource_onboarding_dismissals
      for select to authenticated using (auth.uid() = user_id or public.dp_resources_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dp_resource_onboarding_dismissals' and policyname = 'onboarding users insert own dismissals') then
    create policy "onboarding users insert own dismissals" on public.dp_resource_onboarding_dismissals
      for insert to authenticated with check (auth.uid() = user_id);
  end if;
end;
$$;
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
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' or p_username ~ '^_' or p_username ~ '_$' or position('__' in p_username) > 0 then return 'invalid_format'; end if;
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

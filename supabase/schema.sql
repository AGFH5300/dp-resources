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

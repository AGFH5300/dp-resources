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

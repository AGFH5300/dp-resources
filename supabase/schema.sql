create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.activity_logs (
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

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_approval_idx on public.profiles (is_approved, created_at desc);
create index if not exists activity_user_date_idx on public.activity_logs (user_id, created_at desc);
create index if not exists activity_action_date_idx on public.activity_logs (action, created_at desc);
create index if not exists activity_file_id_idx on public.activity_logs (file_id);
create index if not exists activity_file_name_idx on public.activity_logs (lower(file_name));

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_approved = true
  )
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, is_approved)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'user', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.activity_logs enable row level security;

create policy "users read own profile" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "users read own activity" on public.activity_logs for select using (auth.uid() = user_id or public.is_admin());
create policy "admins read all activity" on public.activity_logs for select using (public.is_admin());

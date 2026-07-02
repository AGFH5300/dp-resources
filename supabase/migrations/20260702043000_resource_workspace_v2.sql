create extension if not exists pgcrypto;

create table if not exists public.dp_resource_index (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text unique not null,
  parent_drive_file_id text null,
  name text not null,
  normalized_name text not null,
  path text not null,
  mime_type text not null,
  is_folder boolean not null,
  size_bytes bigint null,
  modified_at timestamptz null,
  indexed_at timestamptz not null default now(),
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(path,'') || ' ' || coalesce(mime_type,''))) stored
);
create index if not exists dp_resource_index_normalized_name_idx on public.dp_resource_index (normalized_name);
create index if not exists dp_resource_index_path_idx on public.dp_resource_index (path);
create index if not exists dp_resource_index_is_folder_idx on public.dp_resource_index (is_folder);
create index if not exists dp_resource_index_modified_at_idx on public.dp_resource_index (modified_at desc);
create index if not exists dp_resource_index_search_idx on public.dp_resource_index using gin (search_vector);

create table if not exists public.dp_resource_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drive_file_id text not null,
  created_at timestamptz default now(),
  unique(user_id, drive_file_id)
);
create index if not exists dp_resource_favorites_user_idx on public.dp_resource_favorites (user_id, created_at desc);

create table if not exists public.dp_resource_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reporter_email text not null,
  drive_file_id text null,
  resource_name text null,
  resource_path text null,
  category text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_review','resolved')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.dp_support_tickets (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reporter_email text not null,
  category text not null,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_review','resolved')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.dp_resource_index enable row level security;
alter table public.dp_resource_favorites enable row level security;
alter table public.dp_resource_reports enable row level security;
alter table public.dp_support_tickets enable row level security;

drop policy if exists "authenticated users can read resource index" on public.dp_resource_index;
create policy "authenticated users can read resource index" on public.dp_resource_index for select to authenticated using (true);

drop policy if exists "favorites owner read" on public.dp_resource_favorites;
create policy "favorites owner read" on public.dp_resource_favorites for select to authenticated using (auth.uid() = user_id);
drop policy if exists "favorites owner insert" on public.dp_resource_favorites;
create policy "favorites owner insert" on public.dp_resource_favorites for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "favorites owner delete" on public.dp_resource_favorites;
create policy "favorites owner delete" on public.dp_resource_favorites for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "reports owner insert" on public.dp_resource_reports;
create policy "reports owner insert" on public.dp_resource_reports for insert to authenticated with check (auth.uid() = reporter_id);
drop policy if exists "reports owner read" on public.dp_resource_reports;
create policy "reports owner read" on public.dp_resource_reports for select to authenticated using (auth.uid() = reporter_id or exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'));
drop policy if exists "reports admin update" on public.dp_resource_reports;
create policy "reports admin update" on public.dp_resource_reports for update to authenticated using (exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'));

drop policy if exists "tickets owner insert" on public.dp_support_tickets;
create policy "tickets owner insert" on public.dp_support_tickets for insert to authenticated with check (auth.uid() = reporter_id);
drop policy if exists "tickets owner read" on public.dp_support_tickets;
create policy "tickets owner read" on public.dp_support_tickets for select to authenticated using (auth.uid() = reporter_id or exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'));
drop policy if exists "tickets admin update" on public.dp_support_tickets;
create policy "tickets admin update" on public.dp_support_tickets for update to authenticated using (exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'));

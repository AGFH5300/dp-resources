create table if not exists public.dp_resource_index_sync_state (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'idle' check (status in ('idle','indexing','complete','failed')),
  sync_run_id uuid null,
  folder_queue jsonb not null default '[]'::jsonb,
  processed_folders integer not null default 0,
  indexed_resources integer not null default 0,
  started_at timestamptz null,
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  error_message text null
);

alter table public.dp_resource_index add column if not exists last_seen_sync_run_id uuid null;
create index if not exists dp_resource_index_last_seen_sync_run_idx on public.dp_resource_index (last_seen_sync_run_id);

alter table public.dp_resource_index_sync_state enable row level security;
drop policy if exists "admins can read index sync state" on public.dp_resource_index_sync_state;
create policy "admins can read index sync state" on public.dp_resource_index_sync_state for select to authenticated using (exists (select 1 from public.dp_resource_memberships m where m.id = auth.uid() and m.role = 'admin'));

alter table public.dp_resource_reports add column if not exists admin_notes text null;
alter table public.dp_support_tickets add column if not exists admin_notes text null;

alter table public.dp_resource_index_sync_state
  add column if not exists lock_token uuid null,
  add column if not exists lock_expires_at timestamptz null;

insert into public.dp_resource_index_sync_state (id, status, folder_queue)
values ('00000000-0000-0000-0000-000000000001', 'idle', '[]'::jsonb)
on conflict (id) do nothing;

create index if not exists dp_resource_index_sync_state_lock_status_idx
  on public.dp_resource_index_sync_state (id, status, lock_expires_at);

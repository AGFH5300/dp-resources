-- Live admin indexing telemetry and a critical recursive-inheritance join index.
-- Additive only: existing index rows and the resumable queue are preserved.

alter table public.dp_resource_index_sync_state
  add column if not exists phase text not null default 'idle',
  add column if not exists indexed_files integer not null default 0,
  add column if not exists indexed_folders integer not null default 0,
  add column if not exists baseline_total_items integer not null default 0,
  add column if not exists baseline_total_folders integer not null default 0,
  add column if not exists queue_depth integer not null default 0,
  add column if not exists continuation_pages integer not null default 0,
  add column if not exists current_path text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists last_batch_items integer not null default 0,
  add column if not exists last_batch_folders integer not null default 0,
  add column if not exists last_batch_ms integer not null default 0;

-- dp_resolve_resource_source_inheritance recursively joins children on this
-- column. Without the index PostgreSQL repeatedly scans the whole resource
-- index and can hit statement_timeout as the library grows.
create index if not exists dp_resource_index_parent_drive_file_id_idx
  on public.dp_resource_index (parent_drive_file_id)
  where parent_drive_file_id is not null;

update public.dp_resource_index_sync_state state
set
  phase = case
    when state.status = 'complete' then 'complete'
    when state.status = 'indexing' then 'scanning'
    when state.status in ('paused', 'failed') then 'paused'
    else 'idle'
  end,
  indexed_files = coalesce((
    select count(*)::integer
    from public.dp_resource_index item
    where item.last_seen_sync_run_id = state.sync_run_id
      and not item.is_folder
  ), 0),
  indexed_folders = coalesce((
    select count(*)::integer
    from public.dp_resource_index item
    where item.last_seen_sync_run_id = state.sync_run_id
      and item.is_folder
  ), 0),
  baseline_total_items = coalesce((
    select count(*)::integer from public.dp_resource_index
  ), 0),
  baseline_total_folders = coalesce((
    select count(*)::integer
    from public.dp_resource_index item
    where item.is_folder
  ), 0),
  queue_depth = jsonb_array_length(coalesce(state.folder_queue, '[]'::jsonb)),
  continuation_pages = coalesce((
    select count(*)::integer
    from jsonb_array_elements(coalesce(state.folder_queue, '[]'::jsonb)) queued
    where nullif(queued ->> 'pageToken', '') is not null
  ), 0),
  current_path = coalesce(state.folder_queue -> 0 ->> 'path', null),
  heartbeat_at = coalesce(state.updated_at, now())
where state.id = '00000000-0000-0000-0000-000000000001'::uuid;

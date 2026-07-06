alter table public.dp_resource_index_sync_state drop constraint if exists dp_resource_index_sync_state_status_check;
alter table public.dp_resource_index_sync_state add constraint dp_resource_index_sync_state_status_check check (status in ('idle','indexing','complete','paused','failed'));

update public.dp_resource_index_sync_state
set status = 'paused', updated_at = now(), error_message = coalesce(error_message, 'Indexing paused with queued folders remaining.')
where status = 'idle'
  and completed_at is null
  and jsonb_array_length(coalesce(folder_queue, '[]'::jsonb)) > 0;

create or replace function public.dp_folder_size_summaries(folder_ids text[])
returns table (
  folder_id text,
  total_known_bytes bigint,
  descendant_file_count bigint,
  known_size_file_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_folders as (
    select distinct i.drive_file_id, i.path
    from public.dp_resource_index i
    join unnest(folder_ids) as requested(folder_id) on requested.folder_id = i.drive_file_id
    where i.is_folder = true
  )
  select
    folder.drive_file_id as folder_id,
    coalesce(sum(file.size_bytes) filter (where file.size_bytes is not null), 0)::bigint as total_known_bytes,
    count(file.drive_file_id)::bigint as descendant_file_count,
    count(file.size_bytes)::bigint as known_size_file_count
  from requested_folders folder
  join public.dp_resource_index file
    on file.is_folder = false
   and left(file.path, length(folder.path) + 3) = folder.path || ' / '
  group by folder.drive_file_id
  having coalesce(sum(file.size_bytes) filter (where file.size_bytes is not null), 0) > 0;
$$;

revoke all on function public.dp_folder_size_summaries(text[]) from public;
revoke all on function public.dp_folder_size_summaries(text[]) from anon;
revoke all on function public.dp_folder_size_summaries(text[]) from authenticated;
grant execute on function public.dp_folder_size_summaries(text[]) to service_role;

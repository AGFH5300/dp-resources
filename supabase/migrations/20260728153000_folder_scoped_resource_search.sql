create or replace function public.dp_search_resources_in_folder(
  search_query text,
  folder_drive_file_id text,
  result_limit integer default 50
)
returns table (
  drive_file_id text,
  parent_drive_file_id text,
  name text,
  normalized_name text,
  path text,
  mime_type text,
  is_folder boolean,
  size_bytes bigint,
  modified_at timestamptz,
  indexed_at timestamptz,
  rank_score numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit integer := least(greatest(coalesce(result_limit, 50), 1), 50);
  tokens text[];
  prefix_query tsquery;
  phrase text := lower(btrim(coalesce(search_query, '')));
  scoped_path text;
begin
  select resource.path into scoped_path
  from public.dp_resource_index as resource
  where resource.drive_file_id = folder_drive_file_id
    and resource.is_folder = true
  limit 1;

  if scoped_path is null then
    return;
  end if;

  select array_agg(token) into tokens
  from regexp_split_to_table(phrase, '[^[:alnum:]]+') as token
  where length(token) >= 2
    and token not in ('the', 'and', 'for', 'with', 'from');

  if tokens is null or array_length(tokens, 1) is null then
    return;
  end if;

  select to_tsquery(
    'simple',
    string_agg(quote_literal(token) || ':*', ' & ')
  ) into prefix_query
  from unnest(tokens) as token;

  return query
  select
    resource.drive_file_id,
    resource.parent_drive_file_id,
    resource.name,
    resource.normalized_name,
    resource.path,
    resource.mime_type,
    resource.is_folder,
    resource.size_bytes,
    resource.modified_at,
    resource.indexed_at,
    (
      case when resource.is_folder and lower(resource.name) = phrase then 1000 else 0 end +
      case when not resource.is_folder and lower(resource.name) = phrase then 900 else 0 end +
      case when resource.is_folder and lower(resource.name) like phrase || '%' then 800 else 0 end +
      case when not resource.is_folder and lower(resource.name) like phrase || '%' then 700 else 0 end +
      ts_rank_cd(resource.search_vector, prefix_query) * 100 +
      case when resource.is_folder then 25 else 0 end -
      greatest(
        array_length(regexp_split_to_array(resource.path, ' / '), 1) -
          array_length(regexp_split_to_array(scoped_path, ' / '), 1),
        0
      )
    )::numeric as rank_score
  from public.dp_resource_index as resource
  where resource.search_vector @@ prefix_query
    and left(resource.path, char_length(scoped_path) + 3) = scoped_path || ' / '
  order by rank_score desc, resource.is_folder desc, resource.name asc
  limit safe_limit;
end;
$$;

revoke all on function public.dp_search_resources_in_folder(text, text, integer) from public;
revoke all on function public.dp_search_resources_in_folder(text, text, integer) from anon;
revoke all on function public.dp_search_resources_in_folder(text, text, integer) from authenticated;
grant execute on function public.dp_search_resources_in_folder(text, text, integer) to service_role;

create or replace function public.dp_search_resources(search_query text, result_limit integer default 50)
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
  safe_limit integer := least(greatest(coalesce(result_limit,50),1),50);
  tokens text[];
  prefix_query tsquery;
  phrase text := lower(btrim(coalesce(search_query,'')));
begin
  select array_agg(tok) into tokens
  from regexp_split_to_table(phrase, '[^[:alnum:]]+') tok
  where length(tok) >= 2 and tok not in ('the','and','for','with','from');

  if tokens is null or array_length(tokens,1) is null then
    return;
  end if;

  select to_tsquery('simple', string_agg(quote_literal(t) || ':*', ' & ')) into prefix_query
  from unnest(tokens) as t;

  return query
  select r.drive_file_id, r.parent_drive_file_id, r.name, r.normalized_name, r.path, r.mime_type,
         r.is_folder, r.size_bytes, r.modified_at, r.indexed_at,
         (
           case when r.is_folder and lower(r.name)=phrase then 1000 else 0 end +
           case when not r.is_folder and lower(r.name)=phrase then 900 else 0 end +
           case when r.is_folder and lower(r.name) like phrase || '%' then 800 else 0 end +
           case when not r.is_folder and lower(r.name) like phrase || '%' then 700 else 0 end +
           ts_rank_cd(r.search_vector, prefix_query) * 100 +
           case when r.is_folder then 25 else 0 end -
           greatest(array_length(regexp_split_to_array(r.path,' / '),1)-2,0)
         )::numeric as rank_score
  from public.dp_resource_index r
  where r.search_vector @@ prefix_query
  order by rank_score desc, r.is_folder desc, r.name asc
  limit safe_limit;
end;
$$;

revoke all on function public.dp_search_resources(text, integer) from public;
revoke all on function public.dp_search_resources(text, integer) from anon;
revoke all on function public.dp_search_resources(text, integer) from authenticated;
grant execute on function public.dp_search_resources(text, integer) to service_role;

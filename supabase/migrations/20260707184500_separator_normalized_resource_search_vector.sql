-- Index filename and MIME separators in both original and normalized forms so extension searches remain GIN-backed.

drop index if exists public.dp_resource_index_search_idx;

alter table public.dp_resource_index
  drop column if exists search_vector;

alter table public.dp_resource_index
  add column search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      concat_ws(
        ' ',
        coalesce(name,''),
        regexp_replace(coalesce(name,''), '[^[:alnum:]]+', ' ', 'g'),
        coalesce(path,''),
        regexp_replace(coalesce(path,''), '[^[:alnum:]]+', ' ', 'g'),
        coalesce(mime_type,''),
        regexp_replace(coalesce(mime_type,''), '[^[:alnum:]]+', ' ', 'g')
      )
    )
  ) stored;

create index if not exists dp_resource_index_search_idx on public.dp_resource_index using gin (search_vector);

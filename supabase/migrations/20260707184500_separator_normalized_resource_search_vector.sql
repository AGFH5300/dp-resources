-- Index filename and MIME separators in both original and normalized forms so extension searches remain GIN-backed.

-- The generated expression must use only immutable operations. Keep separator
-- normalization explicit because generated columns reject non-immutable helpers.

drop index if exists public.dp_resource_index_search_idx;

alter table public.dp_resource_index
  drop column if exists search_vector;

alter table public.dp_resource_index
  add column search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(name,'') || ' ' ||
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(name,''), '.', ' '), '/', ' '), '_', ' '), '-', ' '), ':', ' '), ',', ' '), ';', ' '), '(', ' '), ')', ' '), '[', ' '), ']', ' '), '{', ' '), '}', ' ') || ' ' ||
      coalesce(path,'') || ' ' ||
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(path,''), '.', ' '), '/', ' '), '_', ' '), '-', ' '), ':', ' '), ',', ' '), ';', ' '), '(', ' '), ')', ' '), '[', ' '), ']', ' '), '{', ' '), '}', ' ') || ' ' ||
      coalesce(mime_type,'') || ' ' ||
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(mime_type,''), '.', ' '), '/', ' '), '_', ' '), '-', ' '), ':', ' '), ',', ' '), ';', ' '), '(', ' '), ')', ' '), '[', ' '), ']', ' '), '{', ' '), '}', ' ')
    )
  ) stored;

create index if not exists dp_resource_index_search_idx on public.dp_resource_index using gin (search_vector);

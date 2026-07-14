-- Add searchable page text to prepared PDF previews without changing page images.

alter table public.dp_pdf_preview_documents
  add column if not exists text_ready_at timestamptz;

alter table public.dp_pdf_preview_pages
  add column if not exists search_text text;

create or replace function public.dp_store_pdf_preview_text(
  p_document_id uuid,
  p_pages jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_document_id is null then
    raise exception 'document id is required';
  end if;
  if jsonb_typeof(p_pages) <> 'array' then
    raise exception 'page text payload must be an array';
  end if;

  with supplied as (
    select
      (entry->>'pageNumber')::integer as page_number,
      left(coalesce(entry->>'text', ''), 200000) as search_text
    from jsonb_array_elements(p_pages) entry
    where (entry->>'pageNumber') ~ '^[0-9]+$'
  )
  update public.dp_pdf_preview_pages p
  set search_text = supplied.search_text,
      updated_at = now()
  from supplied
  where p.document_id = p_document_id
    and p.page_number = supplied.page_number;

  get diagnostics v_updated = row_count;

  update public.dp_pdf_preview_documents
  set text_ready_at = now(),
      updated_at = now()
  where id = p_document_id;

  return v_updated;
end;
$$;

revoke all on function public.dp_store_pdf_preview_text(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.dp_store_pdf_preview_text(uuid, jsonb)
  to service_role;

create or replace function public.dp_search_pdf_preview(
  p_document_id uuid,
  p_query text,
  p_limit integer default 50
)
returns table (
  page_number integer,
  snippet text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if char_length(v_query) < 2 then
    raise exception 'search query must contain at least two characters';
  end if;
  if char_length(v_query) > 100 then
    raise exception 'search query is too long';
  end if;

  return query
  select
    p.page_number,
    regexp_replace(
      substring(
        p.search_text
        from greatest(strpos(lower(p.search_text), lower(v_query)) - 90, 1)
        for char_length(v_query) + 220
      ),
      E'\\s+',
      ' ',
      'g'
    ) as snippet
  from public.dp_pdf_preview_pages p
  where p.document_id = p_document_id
    and p.search_text is not null
    and strpos(lower(p.search_text), lower(v_query)) > 0
  order by p.page_number
  limit v_limit;
end;
$$;

revoke all on function public.dp_search_pdf_preview(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.dp_search_pdf_preview(uuid, text, integer)
  to service_role;

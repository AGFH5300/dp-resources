-- Track exact word-coordinate search indexes stored privately beside preview page images.

alter table public.dp_pdf_preview_documents
  add column if not exists search_geometry_ready_at timestamptz;

comment on column public.dp_pdf_preview_documents.search_geometry_ready_at is
  'Set after every page has a private pdftotext bbox geometry object for exact in-page search highlighting.';

-- Textbook searches must not silently stop after 100 matching pages. The route
-- requests at most the document page count and this server-side ceiling remains
-- bounded well above the largest indexed textbook.
create or replace function public.dp_search_pdf_preview(
  p_document_id uuid,
  p_query text,
  p_limit integer default 500
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
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 5000);
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
        from greatest(strpos(p.search_text, v_query) - 90, 1)
        for char_length(v_query) + 220
      ),
      E'\s+',
      ' ',
      'g'
    ) as snippet
  from public.dp_pdf_preview_pages p
  where p.document_id = p_document_id
    and p.search_text is not null
    and strpos(p.search_text, v_query) > 0
  order by p.page_number
  limit v_limit;
end;
$$;

revoke all on function public.dp_search_pdf_preview(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.dp_search_pdf_preview(uuid, text, integer)
  to service_role;

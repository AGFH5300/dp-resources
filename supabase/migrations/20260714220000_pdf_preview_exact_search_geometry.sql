-- Track exact word-coordinate search indexes stored privately beside preview page images.

alter table public.dp_pdf_preview_documents
  add column if not exists search_geometry_ready_at timestamptz;

comment on column public.dp_pdf_preview_documents.search_geometry_ready_at is
  'Set after every page has a private pdftotext bbox geometry object for exact in-page search highlighting.';

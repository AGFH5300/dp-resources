-- Private, reusable PDF preview derivatives.
-- Original Google Drive PDFs remain unchanged and continue to be used for downloads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdf-previews', 'pdf-previews', false, 10485760, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.dp_pdf_preview_documents (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null,
  version_key text not null,
  source_name text not null,
  source_modified_at timestamptz,
  source_size_bytes bigint not null check (source_size_bytes > 0),
  storage_prefix text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'partial', 'ready', 'failed')),
  page_count integer check (page_count is null or page_count > 0),
  pages_ready integer not null default 0 check (pages_ready >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  locked_by text,
  lock_expires_at timestamptz,
  last_error text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  first_page_ready_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drive_file_id, version_key)
);

create index if not exists dp_pdf_preview_documents_queue_idx
  on public.dp_pdf_preview_documents (status, lock_expires_at, queued_at);
create index if not exists dp_pdf_preview_documents_source_idx
  on public.dp_pdf_preview_documents (drive_file_id, created_at desc);

create table if not exists public.dp_pdf_preview_pages (
  document_id uuid not null references public.dp_pdf_preview_documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  width_points double precision not null check (width_points > 0),
  height_points double precision not null check (height_points > 0),
  pixel_width integer not null check (pixel_width > 0),
  pixel_height integer not null check (pixel_height > 0),
  object_path text,
  byte_size bigint check (byte_size is null or byte_size > 0),
  etag text,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (document_id, page_number),
  check ((object_path is null and ready_at is null) or (object_path is not null and ready_at is not null))
);

alter table public.dp_pdf_preview_documents enable row level security;
alter table public.dp_pdf_preview_pages enable row level security;

revoke all on public.dp_pdf_preview_documents from anon, authenticated;
revoke all on public.dp_pdf_preview_pages from anon, authenticated;
grant select, insert, update, delete on public.dp_pdf_preview_documents to service_role;
grant select, insert, update, delete on public.dp_pdf_preview_pages to service_role;

create or replace function public.dp_queue_pdf_preview(
  p_drive_file_id text,
  p_source_name text,
  p_source_modified_at timestamptz,
  p_source_size_bytes bigint,
  p_version_key text,
  p_storage_prefix text
)
returns setof public.dp_pdf_preview_documents
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_drive_file_id is null or btrim(p_drive_file_id) = '' then
    raise exception 'drive file id is required';
  end if;
  if p_source_size_bytes is null or p_source_size_bytes <= 0 then
    raise exception 'source size must be positive';
  end if;

  insert into public.dp_pdf_preview_documents (
    drive_file_id,
    version_key,
    source_name,
    source_modified_at,
    source_size_bytes,
    storage_prefix,
    status
  ) values (
    p_drive_file_id,
    p_version_key,
    p_source_name,
    p_source_modified_at,
    p_source_size_bytes,
    p_storage_prefix,
    'queued'
  )
  on conflict (drive_file_id, version_key) do nothing;

  return query
  select d.*
  from public.dp_pdf_preview_documents d
  where d.drive_file_id = p_drive_file_id
    and d.version_key = p_version_key
  limit 1;
end;
$$;

revoke all on function public.dp_queue_pdf_preview(text, text, timestamptz, bigint, text, text) from public, anon, authenticated;
grant execute on function public.dp_queue_pdf_preview(text, text, timestamptz, bigint, text, text) to service_role;

create or replace function public.dp_claim_pdf_preview_job(p_worker_id text)
returns setof public.dp_pdf_preview_documents
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select d.id
    from public.dp_pdf_preview_documents d
    where (
      d.status = 'queued'
      or (d.status = 'failed' and d.attempts < 3)
      or (d.status in ('processing', 'partial') and (d.lock_expires_at is null or d.lock_expires_at < now()))
    )
    order by
      case when d.status in ('processing', 'partial') then 0 else 1 end,
      d.queued_at asc
    for update skip locked
    limit 1
  )
  update public.dp_pdf_preview_documents d
  set status = case when d.pages_ready > 0 then 'partial' else 'processing' end,
      attempts = d.attempts + 1,
      locked_by = p_worker_id,
      lock_expires_at = now() + interval '30 minutes',
      started_at = coalesce(d.started_at, now()),
      last_error = null,
      updated_at = now()
  from candidate c
  where d.id = c.id
  returning d.*;
end;
$$;

revoke all on function public.dp_claim_pdf_preview_job(text) from public, anon, authenticated;
grant execute on function public.dp_claim_pdf_preview_job(text) to service_role;

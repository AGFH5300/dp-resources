-- Add provider-aware storage metadata without changing existing preview objects.
-- Existing rows remain in the private Supabase `pdf-previews` bucket.

alter table public.dp_pdf_preview_documents
  add column if not exists storage_provider text not null default 'supabase';

alter table public.dp_pdf_preview_documents
  add column if not exists storage_bucket text not null default 'pdf-previews';

update public.dp_pdf_preview_documents
set storage_provider = 'supabase'
where storage_provider is null or btrim(storage_provider) = '';

update public.dp_pdf_preview_documents
set storage_bucket = 'pdf-previews'
where storage_bucket is null or btrim(storage_bucket) = '';

alter table public.dp_pdf_preview_documents
  alter column storage_provider set default 'supabase',
  alter column storage_provider set not null,
  alter column storage_bucket set default 'pdf-previews',
  alter column storage_bucket set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dp_pdf_preview_documents'::regclass
      and conname = 'dp_pdf_preview_documents_storage_provider_check'
  ) then
    alter table public.dp_pdf_preview_documents
      add constraint dp_pdf_preview_documents_storage_provider_check
      check (storage_provider in ('supabase', 'r2'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dp_pdf_preview_documents'::regclass
      and conname = 'dp_pdf_preview_documents_storage_bucket_check'
  ) then
    alter table public.dp_pdf_preview_documents
      add constraint dp_pdf_preview_documents_storage_bucket_check
      check (char_length(btrim(storage_bucket)) between 1 and 128);
  end if;
end
$$;

create index if not exists dp_pdf_preview_documents_storage_idx
  on public.dp_pdf_preview_documents (storage_provider, status, updated_at desc);

create or replace function public.dp_queue_pdf_preview_v2(
  p_drive_file_id text,
  p_source_name text,
  p_source_modified_at timestamptz,
  p_source_size_bytes bigint,
  p_version_key text,
  p_storage_prefix text,
  p_storage_provider text,
  p_storage_bucket text
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
  if p_storage_provider not in ('supabase', 'r2') then
    raise exception 'unsupported PDF preview storage provider';
  end if;
  if p_storage_bucket is null or btrim(p_storage_bucket) = '' then
    raise exception 'storage bucket is required';
  end if;

  insert into public.dp_pdf_preview_documents (
    drive_file_id,
    version_key,
    source_name,
    source_modified_at,
    source_size_bytes,
    storage_prefix,
    storage_provider,
    storage_bucket,
    status
  ) values (
    p_drive_file_id,
    p_version_key,
    p_source_name,
    p_source_modified_at,
    p_source_size_bytes,
    p_storage_prefix,
    p_storage_provider,
    p_storage_bucket,
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

revoke all on function public.dp_queue_pdf_preview_v2(text, text, timestamptz, bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.dp_queue_pdf_preview_v2(text, text, timestamptz, bigint, text, text, text, text)
  to service_role;

create or replace function public.dp_pdf_preview_storage_usage(p_storage_provider text)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(p.byte_size), 0)::bigint
  from public.dp_pdf_preview_pages p
  join public.dp_pdf_preview_documents d on d.id = p.document_id
  where d.storage_provider = p_storage_provider
    and p.ready_at is not null;
$$;

revoke all on function public.dp_pdf_preview_storage_usage(text) from public, anon, authenticated;
grant execute on function public.dp_pdf_preview_storage_usage(text) to service_role;

create or replace function public.dp_pdf_preview_document_storage_usage(p_document_id uuid)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(p.byte_size), 0)::bigint
  from public.dp_pdf_preview_pages p
  where p.document_id = p_document_id
    and p.ready_at is not null;
$$;

revoke all on function public.dp_pdf_preview_document_storage_usage(uuid) from public, anon, authenticated;
grant execute on function public.dp_pdf_preview_document_storage_usage(uuid) to service_role;

create table if not exists public.dp_case_attachments (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references auth.users(id) on delete cascade,
  support_ticket_id uuid null references public.dp_support_tickets(id) on delete cascade,
  resource_report_id uuid null references public.dp_resource_reports(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  scan_status text not null check (scan_status in ('clean', 'quarantined', 'rejected')),
  scan_provider text not null,
  created_at timestamptz not null default now(),
  constraint dp_case_attachments_one_parent_check check (
    (support_ticket_id is not null and resource_report_id is null)
    or
    (support_ticket_id is null and resource_report_id is not null)
  )
);

create index if not exists dp_case_attachments_support_ticket_idx
  on public.dp_case_attachments(support_ticket_id, created_at);
create index if not exists dp_case_attachments_resource_report_idx
  on public.dp_case_attachments(resource_report_id, created_at);
create index if not exists dp_case_attachments_uploader_idx
  on public.dp_case_attachments(uploader_id, created_at desc);

alter table public.dp_case_attachments enable row level security;

drop policy if exists "case attachments owner or admin read" on public.dp_case_attachments;
create policy "case attachments owner or admin read"
  on public.dp_case_attachments
  for select to authenticated
  using (
    public.dp_resources_is_admin()
    or exists (
      select 1
      from public.dp_support_tickets ticket
      where ticket.id = dp_case_attachments.support_ticket_id
        and ticket.reporter_id = auth.uid()
    )
    or exists (
      select 1
      from public.dp_resource_reports report
      where report.id = dp_case_attachments.resource_report_id
        and report.reporter_id = auth.uid()
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dp-case-attachments',
  'dp-case-attachments',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

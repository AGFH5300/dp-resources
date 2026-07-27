-- Additive support for Revision Village question-bank provenance, audio,
-- provider-neutral solution IDs and multiple paper associations.

alter table public.dp_qb_assets
  drop constraint if exists dp_qb_assets_content_type_check;

alter table public.dp_qb_assets
  add constraint dp_qb_assets_content_type_check
  check (
    content_type like 'image/%'
    or content_type like 'audio/%'
    or content_type in ('application/pdf', 'application/octet-stream')
  );

alter table public.dp_qb_variant_assets
  drop constraint if exists dp_qb_variant_assets_role_check;

alter table public.dp_qb_variant_assets
  add constraint dp_qb_variant_assets_role_check
  check (
    role in (
      'question',
      'markscheme',
      'examiner_report',
      'content_reference',
      'source_image',
      'question_part',
      'audio',
      'formula_booklet'
    )
  );

alter table public.dp_qb_solution_videos
  alter column vimeo_url drop not null;

alter table public.dp_qb_solution_videos
  add column if not exists provider text not null default 'vimeo',
  add column if not exists provider_video_id text,
  add column if not exists source_url text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

update public.dp_qb_solution_videos
set provider = 'vimeo',
    provider_video_id = coalesce(provider_video_id, vimeo_video_id, vimeo_url),
    source_url = coalesce(source_url, vimeo_url)
where provider_video_id is null or source_url is null;

create unique index if not exists dp_qb_solution_videos_provider_id_idx
  on public.dp_qb_solution_videos (provider, provider_video_id)
  where provider_video_id is not null;

alter table public.dp_qb_papers
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.dp_qb_question_sources (
  id uuid primary key,
  question_id uuid not null references public.dp_qb_questions(id) on delete cascade,
  provider text not null,
  source_question_id text not null,
  source_subject_id text,
  source_reference text,
  source_url text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, source_question_id)
);

create index if not exists dp_qb_question_sources_question_idx
  on public.dp_qb_question_sources (question_id);

create table if not exists public.dp_qb_variant_sources (
  id uuid primary key,
  variant_id uuid not null references public.dp_qb_question_variants(id) on delete cascade,
  provider text not null,
  source_question_id text not null,
  source_course text not null,
  source_topic text not null,
  source_index integer not null default 0 check (source_index >= 0),
  source_metadata jsonb not null default '{}'::jsonb,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, source_question_id, source_course, source_topic)
);

create index if not exists dp_qb_variant_sources_variant_idx
  on public.dp_qb_variant_sources (variant_id);

create table if not exists public.dp_qb_variant_papers (
  variant_id uuid not null references public.dp_qb_question_variants(id) on delete cascade,
  paper_id uuid not null references public.dp_qb_papers(id) on delete cascade,
  is_primary boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  primary key (variant_id, paper_id)
);

create index if not exists dp_qb_variant_papers_paper_idx
  on public.dp_qb_variant_papers (paper_id, variant_id);

create table if not exists public.dp_qb_audio_assets (
  asset_id uuid primary key references public.dp_qb_assets(id) on delete cascade,
  provider text not null,
  source_audio_id text,
  transcript_id text,
  transcript text,
  duration_seconds numeric(12,3),
  source_metadata jsonb not null default '{}'::jsonb,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dp_qb_audio_assets_source_idx
  on public.dp_qb_audio_assets (provider, source_audio_id);

create table if not exists public.dp_qb_paper_assets (
  paper_id uuid not null references public.dp_qb_papers(id) on delete cascade,
  asset_id uuid not null references public.dp_qb_assets(id) on delete cascade,
  role text not null check (role in ('formula_booklet', 'supporting_document')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  primary key (paper_id, asset_id, role)
);

alter table public.dp_qb_question_sources enable row level security;
alter table public.dp_qb_variant_sources enable row level security;
alter table public.dp_qb_variant_papers enable row level security;
alter table public.dp_qb_audio_assets enable row level security;
alter table public.dp_qb_paper_assets enable row level security;

revoke all on table public.dp_qb_question_sources from anon, authenticated;
revoke all on table public.dp_qb_variant_sources from anon, authenticated;
revoke all on table public.dp_qb_variant_papers from anon, authenticated;
revoke all on table public.dp_qb_audio_assets from anon, authenticated;
revoke all on table public.dp_qb_paper_assets from anon, authenticated;

grant select on table public.dp_qb_question_sources to authenticated;
grant select on table public.dp_qb_variant_sources to authenticated;
grant select on table public.dp_qb_variant_papers to authenticated;
grant select on table public.dp_qb_audio_assets to authenticated;
grant select on table public.dp_qb_paper_assets to authenticated;

grant all on table public.dp_qb_question_sources to service_role;
grant all on table public.dp_qb_variant_sources to service_role;
grant all on table public.dp_qb_variant_papers to service_role;
grant all on table public.dp_qb_audio_assets to service_role;
grant all on table public.dp_qb_paper_assets to service_role;

drop policy if exists "question bank admins read question provenance"
  on public.dp_qb_question_sources;
create policy "question bank admins read question provenance"
  on public.dp_qb_question_sources for select to authenticated
  using ((select private.dp_qb_is_admin()));

drop policy if exists "question bank admins read variant provenance"
  on public.dp_qb_variant_sources;
create policy "question bank admins read variant provenance"
  on public.dp_qb_variant_sources for select to authenticated
  using ((select private.dp_qb_is_admin()));

drop policy if exists "question bank eligible member read variant papers"
  on public.dp_qb_variant_papers;
create policy "question bank eligible member read variant papers"
  on public.dp_qb_variant_papers for select to authenticated
  using ((select private.dp_qb_has_access()));

drop policy if exists "question bank eligible member read audio metadata"
  on public.dp_qb_audio_assets;
create policy "question bank eligible member read audio metadata"
  on public.dp_qb_audio_assets for select to authenticated
  using ((select private.dp_qb_has_access()));

drop policy if exists "question bank eligible member read paper assets"
  on public.dp_qb_paper_assets;
create policy "question bank eligible member read paper assets"
  on public.dp_qb_paper_assets for select to authenticated
  using ((select private.dp_qb_has_access()));

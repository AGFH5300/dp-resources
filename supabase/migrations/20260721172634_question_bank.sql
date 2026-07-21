-- Additive IB DP question-bank schema.
--
-- This migration intentionally creates no source-content rows and uploads no
-- objects. Content is loaded by the reviewed, idempotent importer after the
-- migration is approved. Existing Google Drive resource tables are untouched.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table public.dp_qb_import_batches (
  id uuid primary key default gen_random_uuid(),
  archive_identifier text not null,
  archive_sha256 text not null,
  importer_version text not null,
  mode text not null check (mode in ('audit', 'dry_run', 'assets', 'database', 'all', 'verify')),
  status text not null default 'started'
    check (status in ('started', 'audited', 'importing', 'completed', 'failed', 'rolled_back')),
  expected_counts jsonb not null default '{}'::jsonb,
  actual_counts jsonb not null default '{}'::jsonb,
  operation_counts jsonb not null default '{}'::jsonb,
  final_report jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'passed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  unique (archive_sha256, importer_version, mode)
);

create table public.dp_qb_import_findings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.dp_qb_import_batches(id) on delete cascade,
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  code text not null,
  source_dataset text,
  source_question_id uuid,
  source_reference text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index dp_qb_findings_batch_severity_idx
  on public.dp_qb_import_findings (batch_id, severity, code);

create table public.dp_qb_subjects (
  id text primary key,
  slug text not null unique,
  name text not null,
  sort_order integer not null default 0,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dp_qb_courses (
  id uuid primary key,
  subject_id text not null references public.dp_qb_subjects(id) on delete restrict,
  source_key text not null unique,
  slug text not null,
  name text not null,
  level text not null check (level in ('SL', 'HL')),
  syllabus_label text,
  sort_order integer not null default 0,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, slug)
);

create index dp_qb_courses_subject_sort_idx
  on public.dp_qb_courses (subject_id, sort_order, name);

create table public.dp_qb_datasets (
  id uuid primary key,
  course_id uuid not null references public.dp_qb_courses(id) on delete restrict,
  source_filename text not null unique,
  encoded_filename text not null,
  chunk_id integer not null,
  topic_slug text not null,
  expected_question_count integer not null check (expected_question_count >= 0),
  expected_subtopic_count integer not null check (expected_subtopic_count >= 0),
  source_metadata jsonb not null default '{}'::jsonb,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dp_qb_datasets_course_idx
  on public.dp_qb_datasets (course_id, topic_slug);

create table public.dp_qb_topics (
  id uuid primary key,
  dataset_id uuid not null unique references public.dp_qb_datasets(id) on delete cascade,
  course_id uuid not null references public.dp_qb_courses(id) on delete restrict,
  slug text not null,
  name text not null,
  sort_order integer not null default 0,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, slug)
);

create index dp_qb_topics_course_sort_idx
  on public.dp_qb_topics (course_id, sort_order, name);

create table public.dp_qb_subtopics (
  id uuid primary key,
  topic_id uuid not null references public.dp_qb_topics(id) on delete cascade,
  course_id uuid not null references public.dp_qb_courses(id) on delete restrict,
  slug text not null,
  name text not null,
  code text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id, slug)
);

create index dp_qb_subtopics_topic_sort_idx
  on public.dp_qb_subtopics (topic_id, sort_order, name);

create table public.dp_qb_papers (
  id uuid primary key,
  reference text not null,
  calculator_allowed boolean,
  formula_booklet_source_url text,
  formula_booklet_filename text,
  formula_booklet_storage_provider text,
  formula_booklet_storage_bucket text,
  formula_booklet_storage_key text,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dp_qb_papers_reference_idx on public.dp_qb_papers (reference);

create table public.dp_qb_course_papers (
  course_id uuid not null references public.dp_qb_courses(id) on delete cascade,
  paper_id uuid not null references public.dp_qb_papers(id) on delete cascade,
  primary key (course_id, paper_id)
);

create table public.dp_qb_questions (
  id uuid primary key,
  reference text not null,
  content text not null,
  mark_scheme text not null,
  maximum_mark integer not null check (maximum_mark >= 0),
  source_status text not null,
  content_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dp_qb_questions_reference_idx on public.dp_qb_questions (reference);
create index dp_qb_questions_content_hash_idx on public.dp_qb_questions (content_hash);
create index dp_qb_questions_search_idx on public.dp_qb_questions using gin (
  to_tsvector('simple', coalesce(reference, '') || ' ' || coalesce(content, ''))
);

create table public.dp_qb_question_variants (
  id uuid primary key,
  question_id uuid not null references public.dp_qb_questions(id) on delete cascade,
  dataset_id uuid not null references public.dp_qb_datasets(id) on delete cascade,
  course_id uuid not null references public.dp_qb_courses(id) on delete restrict,
  topic_id uuid not null references public.dp_qb_topics(id) on delete cascade,
  paper_id uuid references public.dp_qb_papers(id) on delete set null,
  source_index integer not null check (source_index >= 0),
  source_occurrence integer not null default 0 check (source_occurrence >= 0),
  canonical_source_subtopic_id uuid references public.dp_qb_subtopics(id) on delete set null,
  difficulty_value integer,
  difficulty_label text check (difficulty_label is null or difficulty_label in ('easy', 'medium', 'hard')),
  section_raw text,
  section_normalized text,
  calculator_allowed boolean,
  source_metadata jsonb not null default '{}'::jsonb,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, dataset_id, source_index, source_occurrence)
);

create index dp_qb_variants_course_topic_order_idx
  on public.dp_qb_question_variants (course_id, topic_id, source_index, id);
create index dp_qb_variants_question_idx
  on public.dp_qb_question_variants (question_id);
create index dp_qb_variants_filter_idx
  on public.dp_qb_question_variants (course_id, difficulty_label, paper_id, section_normalized, calculator_allowed);

create table public.dp_qb_question_subtopics (
  variant_id uuid not null references public.dp_qb_question_variants(id) on delete cascade,
  subtopic_id uuid not null references public.dp_qb_subtopics(id) on delete cascade,
  placement_order integer not null check (placement_order >= 0),
  placement_difficulty integer,
  is_fallback boolean not null default false,
  fallback_reason text,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  primary key (variant_id, subtopic_id)
);

create index dp_qb_placements_browse_idx
  on public.dp_qb_question_subtopics (subtopic_id, placement_order, variant_id);

create table public.dp_qb_assets (
  id uuid primary key,
  content_hash text not null unique,
  canonical_source_path text not null,
  original_filename text not null,
  file_extension text not null,
  content_type text not null check (content_type like 'image/%'),
  byte_size bigint not null check (byte_size >= 0),
  storage_provider text not null check (storage_provider in ('r2', 'supabase')),
  storage_bucket text not null,
  storage_key text not null,
  upload_status text not null default 'pending'
    check (upload_status in ('pending', 'uploading', 'uploaded', 'failed')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'failed')),
  uploaded_at timestamptz,
  verified_at timestamptz,
  last_error text,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_provider, storage_bucket, storage_key)
);

create index dp_qb_assets_upload_status_idx
  on public.dp_qb_assets (verification_status, upload_status);

create table public.dp_qb_asset_sources (
  id uuid primary key,
  asset_id uuid not null references public.dp_qb_assets(id) on delete cascade,
  source_key text not null unique,
  source_file_id uuid,
  source_question_id uuid references public.dp_qb_questions(id) on delete set null,
  original_filename text not null,
  original_source_path text not null,
  original_source_url text,
  canonical_normalized_source_path text not null,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  source_uploaded_at timestamptz,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create index dp_qb_asset_sources_asset_idx on public.dp_qb_asset_sources (asset_id);
create index dp_qb_asset_sources_file_idx on public.dp_qb_asset_sources (source_file_id);

create table public.dp_qb_variant_assets (
  variant_id uuid not null references public.dp_qb_question_variants(id) on delete cascade,
  asset_id uuid not null references public.dp_qb_assets(id) on delete cascade,
  source_file_id uuid,
  role text not null check (role in ('question', 'markscheme', 'content_reference')),
  sort_order integer not null default 0,
  alt_text text,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  primary key (variant_id, asset_id, role)
);

create index dp_qb_variant_assets_variant_order_idx
  on public.dp_qb_variant_assets (variant_id, role, sort_order);

create table public.dp_qb_solution_videos (
  id uuid primary key,
  vimeo_url text not null unique,
  vimeo_video_id text,
  source_hash text,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.dp_qb_variant_solution_videos (
  variant_id uuid not null references public.dp_qb_question_variants(id) on delete cascade,
  video_id uuid not null references public.dp_qb_solution_videos(id) on delete cascade,
  source_file_id uuid,
  part_name text not null default '',
  sort_order integer not null default 0,
  created_by_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.dp_qb_import_batches(id) on delete set null,
  primary key (variant_id, video_id, part_name)
);

create table public.dp_qb_user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.dp_qb_questions(id) on delete cascade,
  last_variant_id uuid references public.dp_qb_question_variants(id) on delete set null,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  to_revisit boolean not null default false,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index dp_qb_progress_user_recent_idx
  on public.dp_qb_user_progress (user_id, last_viewed_at desc nulls last);
create index dp_qb_progress_user_status_idx
  on public.dp_qb_user_progress (user_id, status, to_revisit);

create table public.dp_qb_user_saved_questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.dp_qb_questions(id) on delete cascade,
  last_variant_id uuid references public.dp_qb_question_variants(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index dp_qb_saved_user_created_idx
  on public.dp_qb_user_saved_questions (user_id, created_at desc);

-- Derived, importer-maintained search documents. This keeps global question-bank
-- search indexed without denormalizing the canonical content model.
create table public.dp_qb_question_search (
  variant_id uuid primary key references public.dp_qb_question_variants(id) on delete cascade,
  search_text text not null,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(search_text, ''))
  ) stored,
  updated_at timestamptz not null default now()
);

create index dp_qb_question_search_vector_idx
  on public.dp_qb_question_search using gin (search_vector);

create or replace function private.dp_qb_has_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dp_resource_memberships membership
    where membership.id = (select auth.uid())
      and membership.is_suspended is false
  );
$$;

create or replace function private.dp_qb_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dp_resource_memberships membership
    where membership.id = (select auth.uid())
      and membership.role = 'admin'
      and membership.is_suspended is false
  );
$$;

revoke all on function private.dp_qb_has_access() from public;
revoke all on function private.dp_qb_is_admin() from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.dp_qb_has_access() to authenticated, service_role;
grant execute on function private.dp_qb_is_admin() to authenticated, service_role;

do $policies$
declare
  content_table text;
begin
  foreach content_table in array array[
    'dp_qb_subjects',
    'dp_qb_courses',
    'dp_qb_datasets',
    'dp_qb_topics',
    'dp_qb_subtopics',
    'dp_qb_papers',
    'dp_qb_course_papers',
    'dp_qb_questions',
    'dp_qb_question_variants',
    'dp_qb_question_subtopics',
    'dp_qb_assets',
    'dp_qb_variant_assets',
    'dp_qb_solution_videos',
    'dp_qb_variant_solution_videos',
    'dp_qb_question_search'
  ]
  loop
    execute format('alter table public.%I enable row level security', content_table);
    execute format(
      'create policy "question bank eligible member read" on public.%I for select to authenticated using ((select private.dp_qb_has_access()))',
      content_table
    );
    execute format('revoke all on table public.%I from anon, authenticated', content_table);
    execute format('grant select on table public.%I to authenticated', content_table);
    execute format('grant all on table public.%I to service_role', content_table);
  end loop;
end
$policies$;

alter table public.dp_qb_import_batches enable row level security;
alter table public.dp_qb_import_findings enable row level security;
alter table public.dp_qb_asset_sources enable row level security;
alter table public.dp_qb_user_progress enable row level security;
alter table public.dp_qb_user_saved_questions enable row level security;

create policy "question bank admins read import batches"
  on public.dp_qb_import_batches for select to authenticated
  using ((select private.dp_qb_is_admin()));
create policy "question bank admins read import findings"
  on public.dp_qb_import_findings for select to authenticated
  using ((select private.dp_qb_is_admin()));
create policy "question bank admins read asset provenance"
  on public.dp_qb_asset_sources for select to authenticated
  using ((select private.dp_qb_is_admin()));

create policy "question bank users read own progress"
  on public.dp_qb_user_progress for select to authenticated
  using ((select auth.uid()) = user_id and (select private.dp_qb_has_access()));
create policy "question bank users insert own progress"
  on public.dp_qb_user_progress for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.dp_qb_has_access()));
create policy "question bank users update own progress"
  on public.dp_qb_user_progress for update to authenticated
  using ((select auth.uid()) = user_id and (select private.dp_qb_has_access()))
  with check ((select auth.uid()) = user_id and (select private.dp_qb_has_access()));
create policy "question bank users delete own progress"
  on public.dp_qb_user_progress for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.dp_qb_has_access()));

create policy "question bank users read own saved questions"
  on public.dp_qb_user_saved_questions for select to authenticated
  using ((select auth.uid()) = user_id and (select private.dp_qb_has_access()));
create policy "question bank users insert own saved questions"
  on public.dp_qb_user_saved_questions for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.dp_qb_has_access()));
create policy "question bank users update own saved questions"
  on public.dp_qb_user_saved_questions for update to authenticated
  using ((select auth.uid()) = user_id and (select private.dp_qb_has_access()))
  with check ((select auth.uid()) = user_id and (select private.dp_qb_has_access()));
create policy "question bank users delete own saved questions"
  on public.dp_qb_user_saved_questions for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.dp_qb_has_access()));

revoke all on table public.dp_qb_import_batches from anon, authenticated;
revoke all on table public.dp_qb_import_findings from anon, authenticated;
revoke all on table public.dp_qb_asset_sources from anon, authenticated;
grant select on table public.dp_qb_import_batches to authenticated;
grant select on table public.dp_qb_import_findings to authenticated;
grant select on table public.dp_qb_asset_sources to authenticated;
grant all on table public.dp_qb_import_batches to service_role;
grant all on table public.dp_qb_import_findings to service_role;
grant all on table public.dp_qb_asset_sources to service_role;

revoke all on table public.dp_qb_user_progress from anon, authenticated;
revoke all on table public.dp_qb_user_saved_questions from anon, authenticated;
grant select, insert, update, delete on table public.dp_qb_user_progress to authenticated;
grant select, insert, update, delete on table public.dp_qb_user_saved_questions to authenticated;
grant all on table public.dp_qb_user_progress to service_role;
grant all on table public.dp_qb_user_saved_questions to service_role;

create or replace function public.dp_qb_list_questions(
  p_course_id uuid,
  p_query text default null,
  p_topic_id uuid default null,
  p_subtopic_id uuid default null,
  p_difficulty text default null,
  p_paper_id uuid default null,
  p_section text default null,
  p_calculator boolean default null,
  p_status text default null,
  p_saved boolean default null,
  p_revisit boolean default null,
  p_page integer default 1,
  p_page_size integer default 24
)
returns table (
  variant_id uuid,
  question_id uuid,
  reference text,
  content_preview text,
  maximum_mark integer,
  difficulty_value integer,
  difficulty_label text,
  section text,
  calculator_allowed boolean,
  topic_id uuid,
  topic_name text,
  paper_id uuid,
  paper_reference text,
  subtopic_names text[],
  progress_status text,
  to_revisit boolean,
  is_saved boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := (select auth.uid());
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(p_page_size, 24), 1), 100);
begin
  if requesting_user is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select
      variant.id as variant_id,
      question.id as question_id,
      question.reference,
      left(regexp_replace(question.content, '\\s+', ' ', 'g'), 280) as content_preview,
      question.maximum_mark,
      variant.difficulty_value,
      variant.difficulty_label,
      coalesce(variant.section_raw, variant.section_normalized) as section,
      variant.calculator_allowed,
      topic.id as topic_id,
      topic.name as topic_name,
      paper.id as paper_id,
      paper.reference as paper_reference,
      coalesce((
        select array_agg(subtopic.name order by placement.placement_order, subtopic.name)
        from public.dp_qb_question_subtopics placement
        join public.dp_qb_subtopics subtopic on subtopic.id = placement.subtopic_id
        where placement.variant_id = variant.id
      ), array[]::text[]) as subtopic_names,
      coalesce(progress.status, 'not_started') as progress_status,
      coalesce(progress.to_revisit, false) as to_revisit,
      (saved.question_id is not null) as is_saved,
      topic.sort_order,
      variant.source_index
    from public.dp_qb_question_variants variant
    join public.dp_qb_questions question on question.id = variant.question_id
    join public.dp_qb_topics topic on topic.id = variant.topic_id
    left join public.dp_qb_papers paper on paper.id = variant.paper_id
    left join public.dp_qb_user_progress progress
      on progress.user_id = requesting_user and progress.question_id = question.id
    left join public.dp_qb_user_saved_questions saved
      on saved.user_id = requesting_user and saved.question_id = question.id
    left join public.dp_qb_question_search search_document
      on search_document.variant_id = variant.id
    where variant.course_id = p_course_id
      and (p_topic_id is null or variant.topic_id = p_topic_id)
      and (
        p_subtopic_id is null
        or exists (
          select 1 from public.dp_qb_question_subtopics placement
          where placement.variant_id = variant.id and placement.subtopic_id = p_subtopic_id
        )
      )
      and (p_difficulty is null or variant.difficulty_label = lower(p_difficulty))
      and (p_paper_id is null or variant.paper_id = p_paper_id)
      and (p_section is null or variant.section_normalized = upper(p_section))
      and (p_calculator is null or variant.calculator_allowed = p_calculator)
      and (p_status is null or coalesce(progress.status, 'not_started') = p_status)
      and (p_saved is null or (saved.question_id is not null) = p_saved)
      and (p_revisit is null or coalesce(progress.to_revisit, false) = p_revisit)
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or search_document.search_vector @@ websearch_to_tsquery('simple', p_query)
        or question.reference ilike '%' || p_query || '%'
      )
  )
  select
    filtered.variant_id,
    filtered.question_id,
    filtered.reference,
    filtered.content_preview,
    filtered.maximum_mark,
    filtered.difficulty_value,
    filtered.difficulty_label,
    filtered.section,
    filtered.calculator_allowed,
    filtered.topic_id,
    filtered.topic_name,
    filtered.paper_id,
    filtered.paper_reference,
    filtered.subtopic_names,
    filtered.progress_status,
    filtered.to_revisit,
    filtered.is_saved,
    count(*) over() as total_count
  from filtered
  order by filtered.sort_order, filtered.source_index, filtered.variant_id
  limit safe_page_size
  offset (safe_page - 1) * safe_page_size;
end;
$$;

create or replace function public.dp_qb_search_questions(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  variant_id uuid,
  question_id uuid,
  reference text,
  content_preview text,
  maximum_mark integer,
  subject_slug text,
  subject_name text,
  course_slug text,
  course_name text,
  topic_name text,
  subtopic_names text[],
  paper_reference text,
  difficulty_label text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;

  return query
  select
    variant.id,
    question.id,
    question.reference,
    left(regexp_replace(question.content, '\\s+', ' ', 'g'), 280),
    question.maximum_mark,
    subject.slug,
    subject.name,
    course.slug,
    course.name,
    topic.name,
    coalesce((
      select array_agg(subtopic.name order by placement.placement_order, subtopic.name)
      from public.dp_qb_question_subtopics placement
      join public.dp_qb_subtopics subtopic on subtopic.id = placement.subtopic_id
      where placement.variant_id = variant.id
    ), array[]::text[]),
    paper.reference,
    variant.difficulty_label,
    count(*) over()
  from public.dp_qb_question_search search_document
  join public.dp_qb_question_variants variant on variant.id = search_document.variant_id
  join public.dp_qb_questions question on question.id = variant.question_id
  join public.dp_qb_courses course on course.id = variant.course_id
  join public.dp_qb_subjects subject on subject.id = course.subject_id
  join public.dp_qb_topics topic on topic.id = variant.topic_id
  left join public.dp_qb_papers paper on paper.id = variant.paper_id
  where search_document.search_vector @@ websearch_to_tsquery('simple', p_query)
     or question.reference ilike '%' || p_query || '%'
  order by ts_rank(search_document.search_vector, websearch_to_tsquery('simple', p_query)) desc,
    question.reference,
    variant.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.dp_qb_question_neighbors(p_variant_id uuid)
returns table (previous_variant_id uuid, next_variant_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;
  return query
  with current_variant as (
    select course_id
    from public.dp_qb_question_variants
    where id = p_variant_id
  ), ordered as (
    select
      variant.id,
      lag(variant.id) over (
        order by topic.sort_order, variant.source_index, variant.source_occurrence, variant.id
      ) as previous_id,
      lead(variant.id) over (
        order by topic.sort_order, variant.source_index, variant.source_occurrence, variant.id
      ) as next_id
    from public.dp_qb_question_variants variant
    join public.dp_qb_topics topic on topic.id = variant.topic_id
    where variant.course_id = (select course_id from current_variant)
  )
  select ordered.previous_id, ordered.next_id
  from ordered
  where ordered.id = p_variant_id;
end;
$$;

revoke all on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean, integer, integer
) from public;
revoke all on function public.dp_qb_search_questions(text, integer, integer) from public;
revoke all on function public.dp_qb_question_neighbors(uuid) from public;
grant execute on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean, integer, integer
) to authenticated;
grant execute on function public.dp_qb_search_questions(text, integer, integer) to authenticated;
grant execute on function public.dp_qb_question_neighbors(uuid) to authenticated;

comment on table public.dp_qb_questions is
  'Invariant question cores keyed by the authorized source question UUID.';
comment on table public.dp_qb_question_variants is
  'Dataset/course/topic-specific occurrences of a question core.';
comment on table public.dp_qb_question_subtopics is
  'Authoritative browse placements reconstructed from topics.subtopics[].questions[].';
comment on table public.dp_qb_asset_sources is
  'Admin-only source provenance; user-facing code must never select source URLs.';

-- Unified, additive content-source attribution for the Question Bank and the
-- Drive-backed Resource Library. Raw provenance remains in the existing QB
-- source tables; browser-facing helpers below deliberately return only safe
-- display fields.

create temporary table _dp_content_source_protected_counts on commit drop as
select
  (select count(*) from public.dp_qb_questions) as question_cores,
  (select count(*) from public.dp_qb_question_variants) as variants,
  (select count(*) from public.dp_qb_assets) as assets,
  (select count(*) from public.dp_qb_solution_videos) as solution_videos,
  (select count(*) from public.dp_qb_user_progress) as progress_rows,
  (select count(*) from public.dp_qb_user_saved_questions) as saved_rows;

create table public.dp_content_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  display_name text not null,
  short_label text not null,
  description text not null default '',
  source_category text not null check (source_category in (
    'collection', 'institution', 'creator', 'official', 'internal', 'unknown'
  )),
  attribution_label text not null,
  website_url text,
  icon_key text not null default 'source',
  display_order integer not null default 1000,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dp_content_source_aliases (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.dp_content_sources(id) on delete cascade,
  alias text not null,
  alias_key text not null unique,
  created_at timestamptz not null default now()
);

create index dp_content_source_aliases_source_idx
  on public.dp_content_source_aliases (source_id);

insert into public.dp_content_sources
  (slug, display_name, short_label, description, source_category, attribution_label, display_order)
values
  ('revision_village', 'Revision Village', 'Revision Village', 'Collection through which DP Resources indexed this content.', 'collection', 'Indexed from', 10),
  ('revision_town', 'Revision Town', 'Revision Town', 'Collection through which DP Resources indexed this content. Assignments require verified source evidence.', 'collection', 'Indexed from', 20),
  ('pestle', 'PESTLE', 'PESTLE', 'Collection through which DP Resources indexed this content.', 'collection', 'Indexed from', 30),
  ('exam_mate', 'Exam-Mate', 'Exam-Mate', 'Collection through which DP Resources indexed this content.', 'collection', 'Indexed from', 40),
  ('save_my_exams', 'Save My Exams', 'Save My Exams', 'Collection or provider through which a resource was added to DP Resources.', 'collection', 'Source', 50),
  ('school', 'School resource', 'School', 'Resource supplied by a school or school-managed collection.', 'institution', 'Source', 60),
  ('teacher_created', 'Teacher-created', 'Teacher-created', 'Resource identified as teacher-created from reviewed evidence.', 'creator', 'Source', 70),
  ('ib_official', 'Official IB', 'Official IB', 'Official International Baccalaureate material where origin is verified.', 'official', 'Original source', 80),
  ('dp_resources', 'DP Resources original', 'DP Resources', 'Original resource created by DP Resources.', 'internal', 'Source', 90),
  ('unknown', 'Source attribution under review', 'Under review', 'The collection or provider has not yet been verified.', 'unknown', 'Source', 9990)
on conflict (slug) do nothing;

insert into public.dp_content_source_aliases (source_id, alias, alias_key)
select source.id, alias.alias, regexp_replace(lower(trim(alias.alias)), '[^a-z0-9]+', '', 'g')
from public.dp_content_sources source
join (values
  ('revision_village', 'revision_village'),
  ('revision_village', 'Revision Village'),
  ('revision_village', 'revision-village'),
  ('revision_town', 'revision_town'),
  ('revision_town', 'Revision Town'),
  ('pestle', 'pestle'),
  ('pestle', 'PESTLE'),
  ('exam_mate', 'exam_mate'),
  ('exam_mate', 'Exam Mate'),
  ('exam_mate', 'Exam-Mate'),
  ('save_my_exams', 'save_my_exams'),
  ('save_my_exams', 'Save My Exams'),
  ('school', 'school'),
  ('school', 'School resource'),
  ('teacher_created', 'teacher_created'),
  ('teacher_created', 'Teacher-created'),
  ('ib_official', 'ib_official'),
  ('ib_official', 'Official IB'),
  ('dp_resources', 'dp_resources'),
  ('dp_resources', 'DP Resources original'),
  ('unknown', 'unknown'),
  ('unknown', 'source under review')
) as alias(slug, alias) on alias.slug = source.slug
on conflict (alias_key) do nothing;

-- Question-source rows keep their legacy provider text for importer
-- compatibility. source_id is the authoritative canonical provider identity.
alter table public.dp_qb_question_sources
  add column if not exists source_id uuid references public.dp_content_sources(id) on delete restrict,
  add column if not exists source_scope text not null default '',
  add column if not exists assignment_method text not null default 'explicit_import',
  add column if not exists review_status text not null default 'reviewed'
    check (review_status in ('reviewed', 'under_review', 'rejected')),
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.dp_qb_variant_sources
  add column if not exists source_id uuid references public.dp_content_sources(id) on delete restrict,
  add column if not exists assignment_method text not null default 'explicit_import',
  add column if not exists review_status text not null default 'reviewed'
    check (review_status in ('reviewed', 'under_review', 'rejected')),
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

update public.dp_qb_question_sources provenance
set source_id = source.id,
    source_scope = coalesce(provenance.source_subject_id, ''),
    review_status = 'reviewed',
    reviewed_at = coalesce(provenance.updated_at, provenance.created_at)
from public.dp_content_sources source
where source.slug = provenance.provider
  and provenance.source_id is null;

update public.dp_qb_variant_sources provenance
set source_id = source.id,
    review_status = 'reviewed',
    reviewed_at = coalesce(provenance.updated_at, provenance.created_at)
from public.dp_content_sources source
where source.slug = provenance.provider
  and provenance.source_id is null;

alter table public.dp_qb_question_sources
  drop constraint if exists dp_qb_question_sources_provider_source_question_id_key;

create unique index if not exists dp_qb_question_sources_provider_id_scope_uidx
  on public.dp_qb_question_sources (provider, source_question_id, source_scope);
create index if not exists dp_qb_question_sources_source_question_idx
  on public.dp_qb_question_sources (source_id, question_id)
  where review_status <> 'rejected';
create index if not exists dp_qb_variant_sources_source_variant_idx
  on public.dp_qb_variant_sources (source_id, variant_id)
  where review_status <> 'rejected';

-- PESTLE provenance existed only in imported JSON. Course source_key is part of
-- the scope because production evidence shows the upstream question identifier
-- is not globally unique across courses.
insert into public.dp_qb_variant_sources (
  id, variant_id, provider, source_id, source_question_id, source_course,
  source_topic, source_index, source_metadata, created_by_batch_id,
  last_seen_batch_id, assignment_method, review_status, reviewed_at
)
select
  gen_random_uuid(), variant.id, 'pestle', source.id,
  variant.source_metadata ->> 'sourceQuestionId', course.source_key,
  coalesce(nullif(variant.source_metadata ->> 'sourceTopic', ''), topic.slug),
  variant.source_index,
  jsonb_build_object('backfillVersion', 'content_sources_v1'),
  variant.created_by_batch_id, variant.last_seen_batch_id,
  'metadata_backfill', 'reviewed', now()
from public.dp_qb_question_variants variant
join public.dp_qb_courses course on course.id = variant.course_id
join public.dp_qb_topics topic on topic.id = variant.topic_id
join public.dp_content_sources source on source.slug = 'pestle'
where lower(coalesce(variant.source_metadata ->> 'provider', '')) = 'pestle'
  and nullif(variant.source_metadata ->> 'sourceQuestionId', '') is not null
on conflict (provider, source_question_id, source_course, source_topic)
do update set
  source_id = excluded.source_id,
  last_seen_batch_id = excluded.last_seen_batch_id,
  updated_at = now();

insert into public.dp_qb_question_sources (
  id, question_id, provider, source_id, source_question_id, source_subject_id,
  source_reference, source_metadata, created_by_batch_id, last_seen_batch_id,
  source_scope, assignment_method, review_status, reviewed_at
)
select distinct on (variant.question_id, variant.source_metadata ->> 'sourceQuestionId', course.source_key)
  gen_random_uuid(), variant.question_id, 'pestle', source.id,
  variant.source_metadata ->> 'sourceQuestionId',
  nullif(variant.source_metadata ->> 'sourceSubject', ''), question.reference,
  jsonb_build_object('backfillVersion', 'content_sources_v1'),
  variant.created_by_batch_id, variant.last_seen_batch_id,
  course.source_key, 'metadata_backfill', 'reviewed', now()
from public.dp_qb_question_variants variant
join public.dp_qb_questions question on question.id = variant.question_id
join public.dp_qb_courses course on course.id = variant.course_id
join public.dp_content_sources source on source.slug = 'pestle'
where lower(coalesce(variant.source_metadata ->> 'provider', '')) = 'pestle'
  and nullif(variant.source_metadata ->> 'sourceQuestionId', '') is not null
order by variant.question_id, variant.source_metadata ->> 'sourceQuestionId', course.source_key, variant.source_index
on conflict (provider, source_question_id, source_scope)
do update set
  source_id = excluded.source_id,
  last_seen_batch_id = excluded.last_seen_batch_id,
  updated_at = now();

-- The first authorised archive is deliberately not labelled Revision Town or
-- Revision Village: existing evidence does not establish which it was. Mark it
-- explicitly under review so every ready legacy variant has a public-safe state.
insert into public.dp_qb_question_sources (
  id, question_id, provider, source_id, source_question_id, source_reference,
  source_metadata, created_by_batch_id, last_seen_batch_id, source_scope,
  assignment_method, review_status
)
select
  gen_random_uuid(), question.id, 'unknown', source.id, question.id::text,
  question.reference, jsonb_build_object('backfillVersion', 'content_sources_v1'),
  question.created_by_batch_id, question.last_seen_batch_id,
  'legacy_authorized_archive', 'review_needed_backfill', 'under_review'
from public.dp_qb_questions question
join public.dp_content_sources source on source.slug = 'unknown'
where question.source_status = 'published'
on conflict (provider, source_question_id, source_scope)
do update set source_id = excluded.source_id, updated_at = now();

insert into public.dp_qb_variant_sources (
  id, variant_id, provider, source_id, source_question_id, source_course,
  source_topic, source_index, source_metadata, created_by_batch_id,
  last_seen_batch_id, assignment_method, review_status
)
select
  gen_random_uuid(), variant.id, 'unknown', source.id, variant.id::text,
  course.source_key, topic.slug, variant.source_index,
  jsonb_build_object('backfillVersion', 'content_sources_v1'),
  variant.created_by_batch_id, variant.last_seen_batch_id,
  'review_needed_backfill', 'under_review'
from public.dp_qb_question_variants variant
join public.dp_qb_questions question on question.id = variant.question_id
join public.dp_qb_courses course on course.id = variant.course_id
join public.dp_qb_topics topic on topic.id = variant.topic_id
join public.dp_content_sources source on source.slug = 'unknown'
where question.source_status = 'published'
on conflict (provider, source_question_id, source_course, source_topic)
do update set source_id = excluded.source_id, updated_at = now();

-- Library source assignments are metadata only; there is intentionally no
-- foreign key to Drive because removed/reappearing Drive IDs must retain audit
-- history without altering Drive itself.
create table public.dp_resource_source_assignments (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null,
  source_id uuid not null references public.dp_content_sources(id) on delete restrict,
  is_primary boolean not null default true,
  relationship text not null default 'primary' check (relationship in (
    'primary', 'adapted_from', 'compiled_from', 'contributed_by', 'hosted_from'
  )),
  assignment_method text not null check (assignment_method in (
    'manual', 'folder_inheritance', 'import_manifest', 'reviewed_path_rule',
    'reviewed_filename_rule', 'admin_override', 'unresolved'
  )),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  inherited_from_drive_file_id text,
  review_status text not null default 'under_review' check (review_status in (
    'reviewed', 'under_review', 'rejected'
  )),
  applies_to_descendants boolean not null default false,
  resolution_version text,
  backfill_version text,
  last_resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index dp_resource_source_assignment_identity_uidx
  on public.dp_resource_source_assignments (
    drive_file_id, source_id, assignment_method,
    coalesce(inherited_from_drive_file_id, ''), relationship
  );
create index dp_resource_source_assignments_file_idx
  on public.dp_resource_source_assignments (drive_file_id, review_status);
create index dp_resource_source_assignments_source_idx
  on public.dp_resource_source_assignments (source_id, drive_file_id);
create index dp_resource_source_assignments_parent_idx
  on public.dp_resource_source_assignments (inherited_from_drive_file_id)
  where inherited_from_drive_file_id is not null;

create table public.dp_resource_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  display_name text not null,
  display_order integer not null default 1000,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.dp_resource_types (slug, display_name, display_order)
values
  ('notes', 'Notes', 10), ('flashcards', 'Flashcards', 20),
  ('cheatsheet', 'Cheatsheet', 30), ('question_paper', 'Question paper', 40),
  ('markscheme', 'Markscheme', 50), ('worksheet', 'Worksheet', 60),
  ('practice_set', 'Practice set', 70), ('mock_exam', 'Mock exam', 80),
  ('prediction_exam', 'Prediction exam', 90), ('revision_guide', 'Revision guide', 100),
  ('textbook', 'Textbook', 110), ('formula_booklet', 'Formula booklet', 120),
  ('ia_example', 'IA example', 130), ('ee_example', 'EE example', 140),
  ('tok_resource', 'TOK resource', 150), ('presentation', 'Presentation', 160),
  ('video', 'Video', 170), ('audio', 'Audio', 180), ('past_paper', 'Past paper', 190),
  ('other', 'Other', 900), ('needs_review', 'Needs review', 9990)
on conflict (slug) do nothing;

create table public.dp_resource_type_assignments (
  drive_file_id text primary key,
  resource_type_id uuid not null references public.dp_resource_types(id) on delete restrict,
  assignment_method text not null check (assignment_method in (
    'manual', 'import_manifest', 'reviewed_path_rule', 'reviewed_filename_rule',
    'mime_rule', 'admin_override', 'unresolved'
  )),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  review_status text not null default 'under_review' check (review_status in (
    'reviewed', 'under_review', 'rejected'
  )),
  rule_key text,
  backfill_version text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dp_resource_type_assignments_type_idx
  on public.dp_resource_type_assignments (resource_type_id, drive_file_id);

create table public.dp_content_source_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_kind text not null,
  target_id text not null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  change_version text,
  created_at timestamptz not null default now()
);
create index dp_content_source_audit_target_idx
  on public.dp_content_source_audit_log (target_kind, target_id, created_at desc);
create index dp_content_source_audit_recent_idx
  on public.dp_content_source_audit_log (created_at desc);

-- With no reviewed provider-bearing Library path/manifest evidence in the
-- current index, the safe production backfill is explicit review-needed state.
insert into public.dp_resource_source_assignments (
  drive_file_id, source_id, assignment_method, confidence, review_status,
  backfill_version, last_resolved_at
)
select index_row.drive_file_id, source.id, 'unresolved', null, 'under_review',
       'content_sources_v1', now()
from public.dp_resource_index index_row
join public.dp_content_sources source on source.slug = 'unknown'
on conflict do nothing;

-- Every file gets an auditable type state, then only deliberately conservative
-- filename/MIME rules promote obvious classifications to reviewed.
insert into public.dp_resource_type_assignments (
  drive_file_id, resource_type_id, assignment_method, review_status,
  backfill_version
)
select index_row.drive_file_id, resource_type.id, 'unresolved', 'under_review',
       'content_sources_v1'
from public.dp_resource_index index_row
join public.dp_resource_types resource_type on resource_type.slug = 'needs_review'
where not index_row.is_folder
on conflict (drive_file_id) do nothing;

update public.dp_resource_type_assignments assignment
set resource_type_id = resource_type.id,
    assignment_method = 'reviewed_filename_rule', confidence = 1,
    review_status = 'reviewed', rule_key = rule_match.rule_key, updated_at = now()
from public.dp_resource_index index_row
join lateral (
  select case
    when lower(index_row.name) ~ '(^|[^a-z])mark[ _-]?scheme([^a-z]|$)' then 'markscheme'
    when lower(index_row.name) ~ '(^|[^a-z])question[ _-]?paper([^a-z]|$)' then 'question_paper'
    when lower(index_row.name) ~ '(^|[^a-z])cheat[ _-]?sheet([^a-z]|$)' then 'cheatsheet'
    when lower(index_row.name) ~ '(^|[^a-z])formula[ _-]?booklet([^a-z]|$)' then 'formula_booklet'
    else null
  end as type_slug,
  case
    when lower(index_row.name) ~ '(^|[^a-z])mark[ _-]?scheme([^a-z]|$)' then 'filename_markscheme_v1'
    when lower(index_row.name) ~ '(^|[^a-z])question[ _-]?paper([^a-z]|$)' then 'filename_question_paper_v1'
    when lower(index_row.name) ~ '(^|[^a-z])cheat[ _-]?sheet([^a-z]|$)' then 'filename_cheatsheet_v1'
    when lower(index_row.name) ~ '(^|[^a-z])formula[ _-]?booklet([^a-z]|$)' then 'filename_formula_booklet_v1'
    else null
  end as rule_key
) rule_match on rule_match.type_slug is not null
join public.dp_resource_types resource_type on resource_type.slug = rule_match.type_slug
where assignment.drive_file_id = index_row.drive_file_id;

update public.dp_resource_type_assignments assignment
set resource_type_id = resource_type.id,
    assignment_method = 'mime_rule', confidence = 1,
    review_status = 'reviewed', rule_key = 'mime_video_v1', updated_at = now()
from public.dp_resource_index index_row
join public.dp_resource_types resource_type on resource_type.slug = 'video'
where assignment.drive_file_id = index_row.drive_file_id
  and index_row.mime_type like 'video/%'
  and assignment.review_status = 'under_review';

update public.dp_resource_type_assignments assignment
set resource_type_id = resource_type.id,
    assignment_method = 'mime_rule', confidence = 1,
    review_status = 'reviewed', rule_key = 'mime_audio_v1', updated_at = now()
from public.dp_resource_index index_row
join public.dp_resource_types resource_type on resource_type.slug = 'audio'
where assignment.drive_file_id = index_row.drive_file_id
  and index_row.mime_type like 'audio/%'
  and assignment.review_status = 'under_review';

-- Recalculate inherited source assignments from reviewed folder rules. This is
-- service-role-only and mutates metadata rows only; it never calls Drive.
create or replace function public.dp_resolve_resource_source_inheritance(
  p_resolution_version text default 'content_sources_v1'
)
returns table (deleted_rows bigint, inserted_rows bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
  v_inserted bigint;
begin
  delete from public.dp_resource_source_assignments
  where assignment_method = 'folder_inheritance';
  get diagnostics v_deleted = row_count;

  with recursive roots as (
    select assignment.drive_file_id as root_id, assignment.source_id,
           assignment.relationship, index_row.drive_file_id, 0 as depth
    from public.dp_resource_source_assignments assignment
    join public.dp_resource_index index_row
      on index_row.drive_file_id = assignment.drive_file_id
     and index_row.is_folder
    where assignment.applies_to_descendants
      and assignment.review_status = 'reviewed'
      and assignment.assignment_method in ('manual', 'admin_override', 'import_manifest')
  ), descendants as (
    select * from roots
    union all
    select descendants.root_id, descendants.source_id, descendants.relationship,
           child.drive_file_id, descendants.depth + 1
    from descendants
    join public.dp_resource_index child
      on child.parent_drive_file_id = descendants.drive_file_id
  ), nearest as (
    select candidates.*,
           min(candidates.depth) over (partition by candidates.drive_file_id) as min_depth
    from descendants candidates
    where candidates.depth > 0
  )
  insert into public.dp_resource_source_assignments (
    drive_file_id, source_id, is_primary, relationship, assignment_method,
    confidence, inherited_from_drive_file_id, review_status,
    resolution_version, last_resolved_at
  )
  select distinct nearest.drive_file_id, nearest.source_id, true,
         nearest.relationship, 'folder_inheritance', 1,
         nearest.root_id, 'reviewed', p_resolution_version, now()
  from nearest
  where nearest.depth = nearest.min_depth
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  return query select v_deleted, v_inserted;
end;
$$;

-- Practice Builder source filtering is applied after ordinary eligibility
-- filters and before question-core deduplication. Preview, Max all, and final
-- generation all call this same candidate function.
create or replace function public.dp_qb_practice_candidates(
  p_user_id uuid,
  p_configuration jsonb
)
returns table (
  block_key text,
  question_id uuid,
  variant_id uuid,
  course_id uuid,
  course_priority integer,
  variant_priority integer,
  difficulty_rank integer,
  stable_order bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'Practice candidate user is required'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_configuration) <> 'object'
     or jsonb_typeof(p_configuration -> 'blocks') <> 'array'
     or jsonb_array_length(p_configuration -> 'blocks') < 1 then
    raise exception 'Invalid practice configuration blocks'
      using errcode = '22023';
  end if;

  return query
  with blocks as (
    select
      item.value as block_json,
      item.value ->> 'key' as block_key,
      item.value ->> 'selectionType' as selection_type,
      nullif(item.value ->> 'courseId', '')::uuid as direct_course_id,
      case
        when jsonb_typeof(item.value -> 'conceptIds') = 'array'
         and jsonb_array_length(item.value -> 'conceptIds') > 0
          then item.value -> 'conceptIds'
        else jsonb_build_array(item.value ->> 'conceptId')
      end as concept_ids,
      coalesce(item.value -> 'filters', '{}'::jsonb) as filters,
      item.ordinality::integer - 1 as block_order
    from jsonb_array_elements(p_configuration -> 'blocks')
      with ordinality as item(value, ordinality)
  ),
  block_concepts as (
    select
      block.block_key,
      concept.value::uuid as concept_id
    from blocks block
    cross join lateral jsonb_array_elements_text(block.concept_ids)
      concept(value)
    where block.selection_type = 'concept'
  ),
  allowed_courses as (
    select
      block.block_key,
      block.selection_type,
      course.value::uuid as course_id,
      course.ordinality::integer - 1 as course_priority,
      block.filters,
      block.block_order
    from blocks block
    cross join lateral jsonb_array_elements_text(
      case
        when block.selection_type = 'concept'
          then coalesce(block.block_json -> 'courseIds', '[]'::jsonb)
        else '[]'::jsonb
      end
    ) with ordinality as course(value, ordinality)

    union all

    select
      block.block_key,
      block.selection_type,
      block.direct_course_id,
      0,
      block.filters,
      block.block_order
    from blocks block
    where block.selection_type = 'course'
      and block.direct_course_id is not null
  ),
  concept_variant_ids as (
    select
      allowed.block_key,
      selected.concept_id,
      allowed.course_id,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order,
      membership.variant_id
    from allowed_courses allowed
    join block_concepts selected on selected.block_key = allowed.block_key
    join public.dp_qb_concepts concept
      on concept.id = selected.concept_id
     and concept.status = 'approved'
    join public.dp_qb_courses course
      on course.id = allowed.course_id
     and course.subject_id = concept.subject_id
    join public.dp_qb_concept_topic_memberships concept_topic
      on concept_topic.concept_id = concept.id
    join public.dp_qb_variant_topics membership
      on membership.topic_id = concept_topic.topic_id
    where allowed.selection_type = 'concept'

    union

    select
      allowed.block_key,
      selected.concept_id,
      allowed.course_id,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order,
      placement.variant_id
    from allowed_courses allowed
    join block_concepts selected on selected.block_key = allowed.block_key
    join public.dp_qb_concepts concept
      on concept.id = selected.concept_id
     and concept.status = 'approved'
    join public.dp_qb_courses course
      on course.id = allowed.course_id
     and course.subject_id = concept.subject_id
    join public.dp_qb_concept_subtopic_memberships concept_subtopic
      on concept_subtopic.concept_id = concept.id
    join public.dp_qb_question_subtopics placement
      on placement.subtopic_id = concept_subtopic.subtopic_id
    where allowed.selection_type = 'concept'

    union

    select
      allowed.block_key,
      selected.concept_id,
      allowed.course_id,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order,
      override.variant_id
    from allowed_courses allowed
    join block_concepts selected on selected.block_key = allowed.block_key
    join public.dp_qb_concepts concept
      on concept.id = selected.concept_id
     and concept.status = 'approved'
    join public.dp_qb_courses course
      on course.id = allowed.course_id
     and course.subject_id = concept.subject_id
    join public.dp_qb_concept_variant_overrides override
      on override.concept_id = concept.id
     and override.action = 'include'
    where allowed.selection_type = 'concept'
  ),
  eligible_variants as (
    select
      mapped.block_key,
      mapped.concept_id,
      mapped.course_priority,
      mapped.filters,
      mapped.block_order,
      variant.id as variant_id,
      variant.question_id,
      variant.course_id,
      variant.difficulty_label,
      variant.calculator_allowed,
      variant.source_index,
      variant.source_occurrence
    from concept_variant_ids mapped
    join public.dp_qb_question_variants variant
      on variant.id = mapped.variant_id
     and variant.course_id = mapped.course_id
     and variant.render_status = 'ready'
    where not exists (
      select 1
      from public.dp_qb_concept_variant_overrides excluded
      where excluded.concept_id = mapped.concept_id
        and excluded.variant_id = variant.id
        and excluded.action = 'exclude'
    )

    union all

    select
      allowed.block_key,
      null::uuid,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order,
      variant.id,
      variant.question_id,
      variant.course_id,
      variant.difficulty_label,
      variant.calculator_allowed,
      variant.source_index,
      variant.source_occurrence
    from allowed_courses allowed
    join public.dp_qb_question_variants variant
      on variant.course_id = allowed.course_id
     and variant.render_status = 'ready'
    where allowed.selection_type = 'course'
  ),
  filtered as (
    select eligible.*
    from eligible_variants eligible
    left join public.dp_qb_user_progress progress
      on progress.user_id = p_user_id
     and progress.question_id = eligible.question_id
    left join public.dp_qb_user_saved_questions saved
      on saved.user_id = p_user_id
     and saved.question_id = eligible.question_id
    where (
        jsonb_array_length(coalesce(eligible.filters -> 'difficulties', '[]'::jsonb)) = 0
        or coalesce(eligible.difficulty_label, 'unrated') in (
          select jsonb_array_elements_text(eligible.filters -> 'difficulties')
        )
      )
      and (
        jsonb_array_length(coalesce(eligible.filters -> 'statuses', '[]'::jsonb)) = 0
        or coalesce(progress.status, 'not_started') in (
          select jsonb_array_elements_text(eligible.filters -> 'statuses')
        )
      )
      and (
        not (eligible.filters ? 'saved')
        or jsonb_typeof(eligible.filters -> 'saved') = 'null'
        or (saved.question_id is not null) =
          (eligible.filters ->> 'saved')::boolean
      )
      and (
        not (eligible.filters ? 'calculator')
        or jsonb_typeof(eligible.filters -> 'calculator') = 'null'
        or eligible.calculator_allowed =
          (eligible.filters ->> 'calculator')::boolean
      )
      and (
        jsonb_array_length(coalesce(eligible.filters -> 'sourceSlugs', '[]'::jsonb)) = 0
        or exists (
          select 1
          from public.dp_qb_variant_sources provenance
          join public.dp_content_sources source on source.id = provenance.source_id
          where provenance.variant_id = eligible.variant_id
            and provenance.review_status <> 'rejected'
            and source.is_active
            and source.slug in (
              select jsonb_array_elements_text(eligible.filters -> 'sourceSlugs')
            )
        )
      )
  ),
  ranked as (
    select
      filtered.*,
      row_number() over (
        partition by filtered.block_key, filtered.question_id
        order by
          filtered.course_priority,
          coalesce(filtered.source_index, 2147483647),
          coalesce(filtered.source_occurrence, 2147483647),
          filtered.variant_id
      ) as representative_rank
    from filtered
  )
  select
    ranked.block_key,
    ranked.question_id,
    ranked.variant_id,
    ranked.course_id,
    ranked.course_priority,
    0 as variant_priority,
    case coalesce(ranked.difficulty_label, 'unrated')
      when 'easy' then 1
      when 'medium' then 2
      when 'hard' then 3
      else 4
    end as difficulty_rank,
    (
      ranked.block_order::bigint * 1000000000000
      + coalesce(ranked.source_index, 0)::bigint * 1000
      + coalesce(ranked.source_occurrence, 0)::bigint
    ) as stable_order
  from ranked
  where ranked.representative_rank = 1;
end;
$$;

revoke execute on function public.dp_qb_practice_candidates(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.dp_qb_practice_candidates(uuid, jsonb)
  to service_role;

-- CONTENT_SOURCE_ATTRIBUTION_MIGRATION_END

create or replace function public.dp_seed_resource_attribution(p_drive_file_ids text[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.dp_resource_source_assignments (
    drive_file_id, source_id, assignment_method, review_status,
    backfill_version, last_resolved_at
  )
  select index_row.drive_file_id, source.id, 'unresolved', 'under_review',
         'index_sync_v1', now()
  from public.dp_resource_index index_row
  join public.dp_content_sources source on source.slug = 'unknown'
  where index_row.drive_file_id = any(coalesce(p_drive_file_ids, array[]::text[]))
  on conflict do nothing;

  insert into public.dp_resource_type_assignments (
    drive_file_id, resource_type_id, assignment_method, review_status,
    backfill_version
  )
  select index_row.drive_file_id, resource_type.id, 'unresolved', 'under_review',
         'index_sync_v1'
  from public.dp_resource_index index_row
  join public.dp_resource_types resource_type on resource_type.slug = 'needs_review'
  where index_row.drive_file_id = any(coalesce(p_drive_file_ids, array[]::text[]))
    and not index_row.is_folder
  on conflict (drive_file_id) do nothing;

  update public.dp_resource_type_assignments assignment
  set resource_type_id = resource_type.id,
      assignment_method = 'reviewed_filename_rule', confidence = 1,
      review_status = 'reviewed', rule_key = match.rule_key, updated_at = now()
  from public.dp_resource_index index_row
  join lateral (
    select case
      when lower(index_row.name) ~ '(^|[^a-z])mark[ _-]?scheme([^a-z]|$)' then 'markscheme'
      when lower(index_row.name) ~ '(^|[^a-z])question[ _-]?paper([^a-z]|$)' then 'question_paper'
      when lower(index_row.name) ~ '(^|[^a-z])cheat[ _-]?sheet([^a-z]|$)' then 'cheatsheet'
      when lower(index_row.name) ~ '(^|[^a-z])formula[ _-]?booklet([^a-z]|$)' then 'formula_booklet'
      when index_row.mime_type like 'video/%' then 'video'
      when index_row.mime_type like 'audio/%' then 'audio'
      else null end as type_slug,
    case
      when lower(index_row.name) ~ '(^|[^a-z])mark[ _-]?scheme([^a-z]|$)' then 'filename_markscheme_v1'
      when lower(index_row.name) ~ '(^|[^a-z])question[ _-]?paper([^a-z]|$)' then 'filename_question_paper_v1'
      when lower(index_row.name) ~ '(^|[^a-z])cheat[ _-]?sheet([^a-z]|$)' then 'filename_cheatsheet_v1'
      when lower(index_row.name) ~ '(^|[^a-z])formula[ _-]?booklet([^a-z]|$)' then 'filename_formula_booklet_v1'
      when index_row.mime_type like 'video/%' then 'mime_video_v1'
      when index_row.mime_type like 'audio/%' then 'mime_audio_v1'
      else null end as rule_key
  ) match on match.type_slug is not null
  join public.dp_resource_types resource_type on resource_type.slug = match.type_slug
  where assignment.drive_file_id = index_row.drive_file_id
    and index_row.drive_file_id = any(coalesce(p_drive_file_ids, array[]::text[]))
    and assignment.assignment_method = 'unresolved';
end;
$$;

-- Safe, batched public QB attribution. Source references, raw URLs, metadata and
-- import-batch identifiers never cross this interface.
create or replace function public.dp_qb_public_sources_for_variants(p_variant_ids uuid[])
returns table (
  variant_id uuid,
  question_id uuid,
  source_slug text,
  display_name text,
  short_label text,
  attribution_label text,
  display_order integer,
  review_status text,
  is_variant_source boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question Bank access is required' using errcode = '42501';
  end if;

  return query
  with requested as (
    select variant.id as variant_id, variant.question_id
    from public.dp_qb_question_variants variant
    where variant.id = any(coalesce(p_variant_ids, array[]::uuid[]))
  ), links as (
    select requested.variant_id, requested.question_id, provenance.source_id,
           provenance.review_status, true as is_variant_source
    from requested
    join public.dp_qb_variant_sources provenance
      on provenance.variant_id = requested.variant_id
    where provenance.source_id is not null and provenance.review_status <> 'rejected'
    union all
    select requested.variant_id, requested.question_id, provenance.source_id,
           provenance.review_status, false
    from requested
    join public.dp_qb_question_sources provenance
      on provenance.question_id = requested.question_id
    where provenance.source_id is not null and provenance.review_status <> 'rejected'
  )
  select distinct links.variant_id, links.question_id, source.slug,
         source.display_name, source.short_label, source.attribution_label,
         source.display_order, links.review_status, links.is_variant_source
  from links
  join public.dp_content_sources source on source.id = links.source_id
  where source.is_active
  order by links.variant_id, links.is_variant_source desc, source.display_order, source.display_name;
end;
$$;

create or replace function public.dp_content_source_options()
returns table (
  slug text, display_name text, short_label text, attribution_label text,
  display_order integer, question_variant_count bigint, resource_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Member access is required' using errcode = '42501';
  end if;
  return query
  select source.slug, source.display_name, source.short_label,
         source.attribution_label, source.display_order,
         (select count(distinct variant_source.variant_id)
          from public.dp_qb_variant_sources variant_source
          where variant_source.source_id = source.id
            and variant_source.review_status <> 'rejected')::bigint,
         (select count(distinct assignment.drive_file_id)
          from public.dp_resource_source_assignments assignment
          join public.dp_resource_index index_row on index_row.drive_file_id = assignment.drive_file_id
          where assignment.source_id = source.id
            and assignment.review_status <> 'rejected')::bigint
  from public.dp_content_sources source
  where source.is_active
  order by source.display_order, source.display_name;
end;
$$;

create or replace function public.dp_qb_source_options_for_course(p_course_id uuid)
returns table (
  slug text, display_name text, short_label text, attribution_label text,
  display_order integer, eligible_variant_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Member access is required' using errcode = '42501';
  end if;
  return query
  select source.slug, source.display_name, source.short_label,
         source.attribution_label, source.display_order,
         count(distinct provenance.variant_id)::bigint
  from public.dp_content_sources source
  join public.dp_qb_variant_sources provenance on provenance.source_id = source.id
  join public.dp_qb_question_variants variant on variant.id = provenance.variant_id
  where source.is_active
    and provenance.review_status <> 'rejected'
    and variant.render_status = 'ready'
    and variant.course_id = p_course_id
  group by source.id
  having count(distinct provenance.variant_id) > 0
  order by source.display_order, source.display_name;
end;
$$;

create or replace view public.dp_resource_effective_source_assignments
with (security_invoker = true)
as
with ranked as (
  select assignment.*,
    case assignment.assignment_method
      when 'admin_override' then 1 when 'manual' then 1
      when 'import_manifest' then 2 when 'folder_inheritance' then 3
      when 'reviewed_path_rule' then 4 when 'reviewed_filename_rule' then 5
      else 99 end as precedence
  from public.dp_resource_source_assignments assignment
  where assignment.review_status <> 'rejected'
), scored as (
  select ranked.*,
         min(ranked.precedence) over (partition by ranked.drive_file_id) as min_precedence
  from ranked
)
select id, drive_file_id, source_id, is_primary, relationship, review_status,
       assignment_method, inherited_from_drive_file_id, precedence
from scored
where precedence = min_precedence;

create or replace view public.dp_resource_source_catalog
with (security_invoker = true)
as
select index_row.drive_file_id, index_row.parent_drive_file_id, index_row.name,
       index_row.path, index_row.mime_type, index_row.is_folder,
       index_row.size_bytes, index_row.modified_at,
       source.slug as source_slug, source.display_name as source_name,
       source.short_label as source_short_label,
       source.attribution_label, effective.relationship, effective.is_primary,
       effective.review_status as source_review_status,
       resource_type.slug as resource_type_slug,
       resource_type.display_name as resource_type_name,
       type_assignment.review_status as type_review_status
from public.dp_resource_effective_source_assignments effective
join public.dp_resource_index index_row on index_row.drive_file_id = effective.drive_file_id
join public.dp_content_sources source on source.id = effective.source_id and source.is_active
left join public.dp_resource_type_assignments type_assignment
  on type_assignment.drive_file_id = index_row.drive_file_id
 and type_assignment.review_status <> 'rejected'
left join public.dp_resource_types resource_type
  on resource_type.id = type_assignment.resource_type_id and resource_type.is_active;

create or replace function public.dp_resource_source_summary()
returns table (
  source_slug text, display_name text, short_label text, description text,
  file_count bigint, folder_count bigint, total_file_size bigint
)
language sql stable security invoker set search_path = ''
as $$
  select source.slug, source.display_name, source.short_label, source.description,
    count(distinct catalog.drive_file_id) filter (where not catalog.is_folder)::bigint,
    count(distinct catalog.drive_file_id) filter (where catalog.is_folder)::bigint,
    coalesce(sum(catalog.size_bytes) filter (where not catalog.is_folder), 0)::bigint
  from public.dp_content_sources source
  join public.dp_resource_source_catalog catalog on catalog.source_slug = source.slug
  where source.is_active
  group by source.id
  having count(catalog.drive_file_id) > 0
  order by source.display_order, source.display_name;
$$;

create or replace function public.dp_admin_content_source_audit()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'questionSources', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select source.slug, source.display_name, source.display_order,
          count(distinct question_source.question_id) as question_cores,
          count(distinct variant_source.variant_id) as variants
        from public.dp_content_sources source
        left join public.dp_qb_question_sources question_source
          on question_source.source_id = source.id and question_source.review_status <> 'rejected'
        left join public.dp_qb_variant_sources variant_source
          on variant_source.source_id = source.id and variant_source.review_status <> 'rejected'
        group by source.id order by source.display_order
      ) stats
    ), '[]'::jsonb),
    'multiSourceQuestions', (
      select count(*) from (
        select question_id from public.dp_qb_question_sources
        where review_status <> 'rejected'
        group by question_id having count(distinct source_id) > 1
      ) multi
    ),
    'readyVariantsWithoutReviewedSource', (
      select count(*) from public.dp_qb_question_variants variant
      where variant.render_status = 'ready' and not exists (
        select 1 from public.dp_qb_variant_sources provenance
        where provenance.variant_id = variant.id and provenance.review_status = 'reviewed'
      )
    ),
    'variantSourcesUnderReview', (
      select count(*) from public.dp_qb_variant_sources where review_status = 'under_review'
    ),
    'questionSourcesUnderReview', (
      select count(*) from public.dp_qb_question_sources where review_status = 'under_review'
    ),
    'coreVariantSourceConflicts', (
      select count(*) from public.dp_qb_variant_sources variant_source
      join public.dp_qb_question_variants variant on variant.id = variant_source.variant_id
      where variant_source.review_status <> 'rejected' and not exists (
        select 1 from public.dp_qb_question_sources question_source
        where question_source.question_id = variant.question_id
          and question_source.source_id = variant_source.source_id
          and question_source.review_status <> 'rejected'
      )
    ),
    'librarySources', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select source.slug, source.display_name, source.display_order,
          count(distinct assignment.drive_file_id) filter (
            where index_row.is_folder is false
          ) as files,
          count(distinct assignment.drive_file_id) filter (
            where index_row.is_folder is true
          ) as folders
        from public.dp_content_sources source
        left join public.dp_resource_effective_source_assignments assignment
          on assignment.source_id = source.id
        left join public.dp_resource_index index_row
          on index_row.drive_file_id = assignment.drive_file_id
        group by source.id
      ) stats
    ), '[]'::jsonb),
    'libraryAssignmentsByMethod', coalesce((
      select jsonb_object_agg(assignment_method, count_rows)
      from (
        select assignment_method, count(*)::bigint count_rows
        from public.dp_resource_source_assignments
        where review_status <> 'rejected' group by assignment_method
      ) methods
    ), '{}'::jsonb),
    'libraryFilesWithMultipleSources', (
      select count(*) from (
        select assignment.drive_file_id
        from public.dp_resource_effective_source_assignments assignment
        join public.dp_resource_index index_row
          on index_row.drive_file_id = assignment.drive_file_id and not index_row.is_folder
        group by assignment.drive_file_id having count(distinct assignment.source_id) > 1
      ) multi
    ),
    'resourceTypes', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select resource_type.slug, resource_type.display_name, resource_type.display_order,
          count(type_assignment.drive_file_id)::bigint as resources,
          count(type_assignment.drive_file_id) filter (
            where type_assignment.review_status = 'under_review'
          )::bigint as under_review
        from public.dp_resource_types resource_type
        left join public.dp_resource_type_assignments type_assignment
          on type_assignment.resource_type_id = resource_type.id
        group by resource_type.id
      ) stats
    ), '[]'::jsonb),
    'recentChanges', coalesce((
      select jsonb_agg(row_to_json(changes)) from (
        select target_kind, target_id, action, actor_user_id, change_version, created_at
        from public.dp_content_source_audit_log
        order by created_at desc limit 50
      ) changes
    ), '[]'::jsonb)
  );
$$;

create or replace function public.dp_admin_preview_resource_source_assignment(
  p_drive_file_id text,
  p_source_slug text,
  p_recursive boolean default false
)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  target_source_id uuid;
  result jsonb;
begin
  select id into target_source_id from public.dp_content_sources
  where slug = p_source_slug and is_active;
  if target_source_id is null then
    raise exception 'Unknown or inactive source' using errcode = '22023';
  end if;
  if not exists (select 1 from public.dp_resource_index where drive_file_id = p_drive_file_id) then
    raise exception 'Resource not found' using errcode = '22023';
  end if;
  with recursive subtree as (
    select drive_file_id, is_folder from public.dp_resource_index
    where drive_file_id = p_drive_file_id
    union all
    select child.drive_file_id, child.is_folder
    from subtree parent
    join public.dp_resource_index child on child.parent_drive_file_id = parent.drive_file_id
    where p_recursive
  )
  select jsonb_build_object(
    'items', count(*),
    'files', count(*) filter (where not subtree.is_folder),
    'folders', count(*) filter (where subtree.is_folder),
    'conflicts', count(*) filter (where exists (
      select 1
      from public.dp_resource_effective_source_assignments existing
      join public.dp_content_sources existing_source on existing_source.id = existing.source_id
      where existing.drive_file_id = subtree.drive_file_id
        and existing.source_id <> target_source_id
        and existing_source.slug <> 'unknown'
        and existing.review_status <> 'rejected'
    ))
  ) into result from subtree;
  return result;
end;
$$;

create or replace function public.dp_admin_set_resource_source(
  p_actor_user_id uuid,
  p_drive_file_id text,
  p_source_slug text,
  p_recursive boolean default false,
  p_relationship text default 'primary'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target_source_id uuid;
  method text := case when p_recursive then 'manual' else 'admin_override' end;
  before_state jsonb;
  preview jsonb;
begin
  if not exists (
    select 1 from public.dp_resource_memberships membership
    where membership.id = p_actor_user_id and membership.role = 'admin'
      and membership.is_suspended is false
  ) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_relationship not in ('primary','adapted_from','compiled_from','contributed_by','hosted_from') then
    raise exception 'Invalid source relationship' using errcode = '22023';
  end if;
  select id into target_source_id from public.dp_content_sources
  where slug = p_source_slug and is_active;
  if target_source_id is null then raise exception 'Unknown source' using errcode = '22023'; end if;
  preview := public.dp_admin_preview_resource_source_assignment(p_drive_file_id, p_source_slug, p_recursive);
  if p_recursive and not exists (
    select 1 from public.dp_resource_index where drive_file_id = p_drive_file_id and is_folder
  ) then raise exception 'Recursive assignment requires a folder' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object(
    'sourceId', source_id, 'method', assignment_method,
    'relationship', relationship, 'reviewStatus', review_status
  )) into before_state
  from public.dp_resource_source_assignments where drive_file_id = p_drive_file_id;

  update public.dp_resource_source_assignments
  set is_primary = p_relationship = 'primary', relationship = p_relationship,
      confidence = 1, review_status = 'reviewed',
      applies_to_descendants = p_recursive, created_by = p_actor_user_id,
      updated_at = now(), last_resolved_at = now()
  where drive_file_id = p_drive_file_id and source_id = target_source_id
    and assignment_method = method and inherited_from_drive_file_id is null;
  if not found then
    insert into public.dp_resource_source_assignments (
      drive_file_id, source_id, is_primary, relationship, assignment_method,
      confidence, review_status, applies_to_descendants, created_by,
      resolution_version, last_resolved_at
    ) values (
      p_drive_file_id, target_source_id, p_relationship = 'primary', p_relationship,
      method, 1, 'reviewed', p_recursive, p_actor_user_id,
      'admin_v1', now()
    );
  end if;
  perform public.dp_resolve_resource_source_inheritance('admin_v1');
  insert into public.dp_content_source_audit_log (
    actor_user_id, target_kind, target_id, action, before_state, after_state, change_version
  ) values (
    p_actor_user_id, case when p_recursive then 'resource_folder' else 'resource_file' end,
    p_drive_file_id, 'set_source', before_state,
    jsonb_build_object('sourceSlug', p_source_slug, 'relationship', p_relationship,
                       'recursive', p_recursive, 'preview', preview), 'admin_v1'
  );
  return preview || jsonb_build_object('applied', true);
end;
$$;

create or replace function public.dp_admin_remove_resource_source_override(
  p_actor_user_id uuid,
  p_drive_file_id text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare deleted_rows bigint;
begin
  if not exists (
    select 1 from public.dp_resource_memberships membership
    where membership.id = p_actor_user_id and membership.role = 'admin'
      and membership.is_suspended is false
  ) then raise exception 'Admin access required' using errcode = '42501'; end if;
  delete from public.dp_resource_source_assignments
  where drive_file_id = p_drive_file_id
    and assignment_method in ('admin_override', 'manual');
  get diagnostics deleted_rows = row_count;
  perform public.dp_resolve_resource_source_inheritance('admin_v1');
  insert into public.dp_content_source_audit_log (
    actor_user_id, target_kind, target_id, action, after_state, change_version
  ) values (
    p_actor_user_id, 'resource', p_drive_file_id, 'remove_source_override',
    jsonb_build_object('deletedRows', deleted_rows), 'admin_v1'
  );
  return jsonb_build_object('deletedRows', deleted_rows);
end;
$$;

create or replace function public.dp_admin_set_resource_type(
  p_actor_user_id uuid,
  p_drive_file_id text,
  p_resource_type_slug text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare target_type_id uuid; before_state jsonb;
begin
  if not exists (
    select 1 from public.dp_resource_memberships membership
    where membership.id = p_actor_user_id and membership.role = 'admin'
      and membership.is_suspended is false
  ) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.dp_resource_index where drive_file_id = p_drive_file_id and not is_folder
  ) then raise exception 'Indexed file not found' using errcode = '22023'; end if;
  select id into target_type_id from public.dp_resource_types
  where slug = p_resource_type_slug and is_active;
  if target_type_id is null then raise exception 'Unknown resource type' using errcode = '22023'; end if;
  select jsonb_build_object('resourceTypeId', resource_type_id, 'reviewStatus', review_status)
    into before_state from public.dp_resource_type_assignments
    where drive_file_id = p_drive_file_id;
  insert into public.dp_resource_type_assignments (
    drive_file_id, resource_type_id, assignment_method, confidence,
    review_status, rule_key, created_by, updated_at
  ) values (
    p_drive_file_id, target_type_id, 'admin_override', 1,
    'reviewed', 'admin', p_actor_user_id, now()
  ) on conflict (drive_file_id) do update set
    resource_type_id = excluded.resource_type_id,
    assignment_method = excluded.assignment_method, confidence = 1,
    review_status = 'reviewed', rule_key = 'admin', created_by = p_actor_user_id,
    updated_at = now();
  insert into public.dp_content_source_audit_log (
    actor_user_id, target_kind, target_id, action, before_state, after_state, change_version
  ) values (
    p_actor_user_id, 'resource_file', p_drive_file_id, 'set_resource_type', before_state,
    jsonb_build_object('resourceTypeSlug', p_resource_type_slug), 'admin_v1'
  );
end;
$$;

create or replace function public.dp_resource_public_attribution(p_drive_file_ids text[])
returns table (
  drive_file_id text,
  source_slug text,
  source_name text,
  source_short_label text,
  attribution_label text,
  relationship text,
  is_primary boolean,
  source_review_status text,
  resource_type_slug text,
  resource_type_name text,
  type_review_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Member access is required' using errcode = '42501';
  end if;

  return query
  with requested as (
    select unnest(coalesce(p_drive_file_ids, array[]::text[])) as drive_file_id
  ), ranked_assignments as (
    select assignment.*,
      case assignment.assignment_method
        when 'admin_override' then 1 when 'manual' then 1
        when 'import_manifest' then 2 when 'folder_inheritance' then 3
        when 'reviewed_path_rule' then 4 when 'reviewed_filename_rule' then 5
        else 99 end as precedence
    from public.dp_resource_source_assignments assignment
    join requested on requested.drive_file_id = assignment.drive_file_id
    where assignment.review_status <> 'rejected'
  ), effective as (
    select ranked_assignments.*
    from ranked_assignments
    where precedence = (select min(candidate.precedence)
                        from ranked_assignments candidate
                        where candidate.drive_file_id = ranked_assignments.drive_file_id)
  )
  select requested.drive_file_id, source.slug, source.display_name,
         source.short_label, source.attribution_label, effective.relationship,
         effective.is_primary, effective.review_status,
         resource_type.slug, resource_type.display_name, type_assignment.review_status
  from requested
  left join effective on effective.drive_file_id = requested.drive_file_id
  left join public.dp_content_sources source on source.id = effective.source_id and source.is_active
  left join public.dp_resource_type_assignments type_assignment
    on type_assignment.drive_file_id = requested.drive_file_id
   and type_assignment.review_status <> 'rejected'
  left join public.dp_resource_types resource_type
    on resource_type.id = type_assignment.resource_type_id and resource_type.is_active
  order by requested.drive_file_id, effective.is_primary desc nulls last,
           source.display_order nulls last, source.display_name;
end;
$$;

-- Source-aware course listing. Source filtering happens before deduplication by
-- question core so selecting two collections never duplicates the same core.
drop function if exists public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean,
  integer, integer
);
create function public.dp_qb_list_questions(
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
  p_page_size integer default 24,
  p_source_slugs text[] default null
)
returns table (
  variant_id uuid, question_id uuid, reference text, content_preview text,
  maximum_mark integer, difficulty_value integer, difficulty_label text,
  section text, calculator_allowed boolean, topic_id uuid, topic_name text,
  paper_id uuid, paper_reference text, subtopic_names text[],
  progress_status text, to_revisit boolean, is_saved boolean, total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  requesting_user uuid := (select auth.uid());
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(p_page_size, 24), 1), 100);
  normalized_query text := nullif(btrim(coalesce(p_query, '')), '');
  query_pattern text := case when nullif(btrim(coalesce(p_query, '')), '') is null
    then null else '%' || btrim(p_query) || '%' end;
  query_ts tsquery := case when nullif(btrim(coalesce(p_query, '')), '') is null
    then null else websearch_to_tsquery('simple', p_query) end;
begin
  if requesting_user is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;
  return query
  with filtered as (
    select
      variant.id as variant_id, question.id as question_id, question.reference,
      left(regexp_replace(question.content, '\s+', ' ', 'g'), 280) as content_preview,
      question.maximum_mark, variant.difficulty_value, variant.difficulty_label,
      coalesce(variant.section_raw, variant.section_normalized) as section,
      variant.calculator_allowed, primary_topic.id as topic_id,
      private.dp_qb_variant_topic_names(variant.id) as topic_name,
      paper.id as paper_id, paper.reference as paper_reference,
      private.dp_qb_variant_canonical_subtopics(variant.id) as subtopic_names,
      coalesce(progress.status, 'not_started') as progress_status,
      coalesce(progress.to_revisit, false) as to_revisit,
      saved.question_id is not null as is_saved,
      primary_topic.sort_order, variant.source_index
    from public.dp_qb_question_variants variant
    join public.dp_qb_questions question on question.id = variant.question_id
    join public.dp_qb_topics primary_topic on primary_topic.id = variant.topic_id
    join public.dp_qb_courses course on course.id = variant.course_id
    join public.dp_qb_subjects subject on subject.id = course.subject_id
    left join public.dp_qb_papers paper on paper.id = variant.paper_id
    left join public.dp_qb_user_progress progress
      on progress.user_id = requesting_user and progress.question_id = question.id
    left join public.dp_qb_user_saved_questions saved
      on saved.user_id = requesting_user and saved.question_id = question.id
    where variant.course_id = p_course_id
      and variant.render_status = 'ready'
      and (p_topic_id is null or exists (
        select 1 from public.dp_qb_variant_topics membership
        where membership.variant_id = variant.id and membership.topic_id = p_topic_id
      ))
      and (p_subtopic_id is null or private.dp_qb_variant_has_canonical_subtopic(
        variant.id,
        (select selected.canonical_key from public.dp_qb_subtopics selected
         where selected.id = p_subtopic_id and selected.course_id = p_course_id),
        (select parent.canonical_key from public.dp_qb_subtopics selected
         join public.dp_qb_topics parent on parent.id = selected.topic_id
         where selected.id = p_subtopic_id and selected.course_id = p_course_id)
      ))
      and (p_difficulty is null or variant.difficulty_label = lower(p_difficulty))
      and (p_paper_id is null or variant.paper_id = p_paper_id)
      and (p_section is null or variant.section_normalized = upper(p_section))
      and (p_calculator is null or variant.calculator_allowed = p_calculator)
      and (p_status is null or coalesce(progress.status, 'not_started') = p_status)
      and (p_saved is null or (saved.question_id is not null) = p_saved)
      and (p_revisit is null or coalesce(progress.to_revisit, false) = p_revisit)
      and (
        coalesce(cardinality(p_source_slugs), 0) = 0
        or exists (
          select 1
          from public.dp_qb_variant_sources provenance
          join public.dp_content_sources source on source.id = provenance.source_id
          where provenance.variant_id = variant.id
            and provenance.review_status <> 'rejected'
            and source.is_active
            and source.slug = any(p_source_slugs)
        )
      )
      and (
        normalized_query is null
        or to_tsvector('simple', coalesce(question.reference, '') || ' ' || coalesce(question.content, '')) @@ query_ts
        or question.reference ilike query_pattern or course.name ilike query_pattern
        or course.slug ilike query_pattern or subject.name ilike query_pattern
        or subject.slug ilike query_pattern or primary_topic.name ilike query_pattern
        or paper.reference ilike query_pattern
        or array_to_string(private.dp_qb_variant_canonical_subtopics(variant.id), ' ') ilike query_pattern
      )
  ), deduped as (
    select filtered.*,
      row_number() over (
        partition by filtered.question_id
        order by filtered.sort_order, filtered.source_index, filtered.variant_id
      ) as core_rank
    from filtered
  )
  select deduped.variant_id, deduped.question_id, deduped.reference,
    deduped.content_preview, deduped.maximum_mark, deduped.difficulty_value,
    deduped.difficulty_label, deduped.section, deduped.calculator_allowed,
    deduped.topic_id, deduped.topic_name, deduped.paper_id,
    deduped.paper_reference, deduped.subtopic_names, deduped.progress_status,
    deduped.to_revisit, deduped.is_saved, count(*) over()
  from deduped
  where deduped.core_rank = 1
  order by deduped.sort_order, deduped.source_index, deduped.variant_id
  limit safe_page_size offset (safe_page - 1) * safe_page_size;
end;
$$;

-- Global search uses the same match-any source semantics and core deduplication.
drop function if exists public.dp_qb_search_questions(text, integer, integer);
create function public.dp_qb_search_questions(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_source_slugs text[] default null
)
returns table (
  variant_id uuid, question_id uuid, reference text, content_preview text,
  maximum_mark integer, subject_slug text, subject_name text, course_slug text,
  course_name text, topic_name text, subtopic_names text[], paper_reference text,
  difficulty_label text, total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  normalized_query text := btrim(coalesce(p_query, ''));
  query_pattern text := '%' || btrim(coalesce(p_query, '')) || '%';
  query_ts tsquery := websearch_to_tsquery('simple', coalesce(p_query, ''));
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;
  if char_length(normalized_query) < 2 then return; end if;
  return query
  with matches as (
    select variant.id as variant_id, question.id as question_id,
      question.reference,
      left(regexp_replace(question.content, '\s+', ' ', 'g'), 280) as content_preview,
      question.maximum_mark, subject.slug as subject_slug, subject.name as subject_name,
      course.slug as course_slug, course.name as course_name,
      private.dp_qb_variant_topic_names(variant.id) as topic_name,
      private.dp_qb_variant_canonical_subtopics(variant.id) as subtopic_names,
      paper.reference as paper_reference, variant.difficulty_label,
      (ts_rank(to_tsvector('simple', coalesce(question.reference, '') || ' ' || coalesce(question.content, '')), query_ts)
       + case when lower(question.reference) = lower(normalized_query) then 5 else 0 end
       + case when question.reference ilike query_pattern then 1 else 0 end
       + case when course.name ilike query_pattern then 0.35 else 0 end
       + case when subject.name ilike query_pattern then 0.35 else 0 end
       + case when private.dp_qb_variant_topic_names(variant.id) ilike query_pattern then 0.3 else 0 end
       + case when array_to_string(private.dp_qb_variant_canonical_subtopics(variant.id), ' ') ilike query_pattern then 0.25 else 0 end
       + case when paper.reference ilike query_pattern then 0.2 else 0 end) as relevance
    from public.dp_qb_question_variants variant
    join public.dp_qb_questions question on question.id = variant.question_id
    join public.dp_qb_courses course on course.id = variant.course_id
    join public.dp_qb_subjects subject on subject.id = course.subject_id
    left join public.dp_qb_papers paper on paper.id = variant.paper_id
    where variant.render_status = 'ready'
      and (coalesce(cardinality(p_source_slugs), 0) = 0 or exists (
        select 1 from public.dp_qb_variant_sources provenance
        join public.dp_content_sources source on source.id = provenance.source_id
        where provenance.variant_id = variant.id
          and provenance.review_status <> 'rejected'
          and source.is_active and source.slug = any(p_source_slugs)
      ))
      and (
        to_tsvector('simple', coalesce(question.reference, '') || ' ' || coalesce(question.content, '')) @@ query_ts
        or question.reference ilike query_pattern or course.name ilike query_pattern
        or course.slug ilike query_pattern or subject.name ilike query_pattern
        or subject.slug ilike query_pattern or paper.reference ilike query_pattern
        or private.dp_qb_variant_topic_names(variant.id) ilike query_pattern
        or array_to_string(private.dp_qb_variant_canonical_subtopics(variant.id), ' ') ilike query_pattern
      )
  ), ranked as (
    select matches.*,
      row_number() over (partition by matches.question_id order by matches.relevance desc, matches.variant_id) as core_rank
    from matches
  )
  select ranked.variant_id, ranked.question_id, ranked.reference,
    ranked.content_preview, ranked.maximum_mark, ranked.subject_slug,
    ranked.subject_name, ranked.course_slug, ranked.course_name,
    ranked.topic_name, ranked.subtopic_names, ranked.paper_reference,
    ranked.difficulty_label, count(*) over()
  from ranked where ranked.core_rank = 1
  order by ranked.relevance desc, ranked.reference, ranked.variant_id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean,
  integer, integer, text[]
) from public, anon;
grant execute on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean,
  integer, integer, text[]
) to authenticated, service_role;
revoke execute on function public.dp_qb_search_questions(text, integer, integer, text[])
  from public, anon;
grant execute on function public.dp_qb_search_questions(text, integer, integer, text[])
  to authenticated, service_role;

-- RLS and least-privilege grants. Sensitive registry fields, aliases, technical
-- assignment details and audit rows are not readable by ordinary browser roles.
alter table public.dp_content_sources enable row level security;
alter table public.dp_content_source_aliases enable row level security;
alter table public.dp_resource_source_assignments enable row level security;
alter table public.dp_resource_types enable row level security;
alter table public.dp_resource_type_assignments enable row level security;
alter table public.dp_content_source_audit_log enable row level security;

create policy "eligible members read content source labels"
  on public.dp_content_sources for select to authenticated
  using (is_active and (select private.dp_qb_has_access()));
create policy "admins read source aliases"
  on public.dp_content_source_aliases for select to authenticated
  using ((select private.dp_qb_is_admin()));
create policy "eligible members read resource source assignments"
  on public.dp_resource_source_assignments for select to authenticated
  using (review_status <> 'rejected' and (select private.dp_qb_has_access()));
create policy "eligible members read resource types"
  on public.dp_resource_types for select to authenticated
  using (is_active and (select private.dp_qb_has_access()));
create policy "eligible members read resource type assignments"
  on public.dp_resource_type_assignments for select to authenticated
  using (review_status <> 'rejected' and (select private.dp_qb_has_access()));
create policy "admins read content source audit log"
  on public.dp_content_source_audit_log for select to authenticated
  using ((select private.dp_qb_is_admin()));

revoke all on table public.dp_content_sources from anon, authenticated;
revoke all on table public.dp_content_source_aliases from anon, authenticated;
revoke all on table public.dp_resource_source_assignments from anon, authenticated;
revoke all on table public.dp_resource_types from anon, authenticated;
revoke all on table public.dp_resource_type_assignments from anon, authenticated;
revoke all on table public.dp_content_source_audit_log from anon, authenticated;

grant select (id, slug, display_name, short_label, description, source_category,
  attribution_label, icon_key, display_order, is_active)
  on public.dp_content_sources to authenticated;
grant select (drive_file_id, source_id, is_primary, relationship, review_status)
  on public.dp_resource_source_assignments to authenticated;
grant select (id, slug, display_name, display_order, is_active)
  on public.dp_resource_types to authenticated;
grant select (drive_file_id, resource_type_id, review_status)
  on public.dp_resource_type_assignments to authenticated;

grant all on table public.dp_content_sources to service_role;
grant all on table public.dp_content_source_aliases to service_role;
grant all on table public.dp_resource_source_assignments to service_role;
grant all on table public.dp_resource_types to service_role;
grant all on table public.dp_resource_type_assignments to service_role;
grant all on table public.dp_content_source_audit_log to service_role;

revoke execute on function public.dp_resolve_resource_source_inheritance(text)
  from public, anon, authenticated;
grant execute on function public.dp_resolve_resource_source_inheritance(text)
  to service_role;
revoke execute on function public.dp_seed_resource_attribution(text[])
  from public, anon, authenticated;
grant execute on function public.dp_seed_resource_attribution(text[])
  to service_role;
revoke execute on function public.dp_qb_public_sources_for_variants(uuid[])
  from public, anon;
grant execute on function public.dp_qb_public_sources_for_variants(uuid[])
  to authenticated, service_role;
revoke execute on function public.dp_content_source_options()
  from public, anon;
grant execute on function public.dp_content_source_options()
  to authenticated, service_role;
revoke execute on function public.dp_qb_source_options_for_course(uuid)
  from public, anon;
grant execute on function public.dp_qb_source_options_for_course(uuid)
  to authenticated, service_role;
revoke all on table public.dp_resource_effective_source_assignments from public, anon, authenticated;
grant select on table public.dp_resource_effective_source_assignments to service_role;
revoke all on table public.dp_resource_source_catalog from public, anon, authenticated;
grant select on table public.dp_resource_source_catalog to service_role;
revoke execute on function public.dp_resource_source_summary() from public, anon, authenticated;
grant execute on function public.dp_resource_source_summary() to service_role;
revoke execute on function public.dp_admin_content_source_audit() from public, anon, authenticated;
grant execute on function public.dp_admin_content_source_audit() to service_role;
revoke execute on function public.dp_admin_preview_resource_source_assignment(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.dp_admin_preview_resource_source_assignment(text, text, boolean)
  to service_role;
revoke execute on function public.dp_admin_set_resource_source(uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.dp_admin_set_resource_source(uuid, text, text, boolean, text)
  to service_role;
revoke execute on function public.dp_admin_remove_resource_source_override(uuid, text)
  from public, anon, authenticated;
grant execute on function public.dp_admin_remove_resource_source_override(uuid, text)
  to service_role;
revoke execute on function public.dp_admin_set_resource_type(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.dp_admin_set_resource_type(uuid, text, text)
  to service_role;
revoke execute on function public.dp_resource_public_attribution(text[])
  from public, anon;
grant execute on function public.dp_resource_public_attribution(text[])
  to authenticated, service_role;

-- Migration-time assertions: protected content/user state is not mutated, all
-- dedicated source rows resolve canonically, and ready variants are covered.
do $$
declare
  before_counts record;
begin
  select * into before_counts from _dp_content_source_protected_counts;
  if (select count(*) from public.dp_qb_questions) <> before_counts.question_cores
     or (select count(*) from public.dp_qb_question_variants) <> before_counts.variants
     or (select count(*) from public.dp_qb_assets) <> before_counts.assets
     or (select count(*) from public.dp_qb_solution_videos) <> before_counts.solution_videos
     or (select count(*) from public.dp_qb_user_progress) <> before_counts.progress_rows
     or (select count(*) from public.dp_qb_user_saved_questions) <> before_counts.saved_rows then
    raise exception 'Content-source migration changed protected Question Bank or user-state counts';
  end if;
  if exists (select 1 from public.dp_qb_question_sources where source_id is null)
     or exists (select 1 from public.dp_qb_variant_sources where source_id is null) then
    raise exception 'Content-source migration left unresolved dedicated source links';
  end if;
  if exists (
    select variant.id
    from public.dp_qb_question_variants variant
    where variant.render_status = 'ready'
      and not exists (
        select 1 from public.dp_qb_variant_sources source
        where source.variant_id = variant.id and source.review_status <> 'rejected'
      )
  ) then
    raise exception 'Content-source migration left ready variants without an attribution state';
  end if;
end;
$$;

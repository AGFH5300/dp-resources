-- Keep incomplete or malformed Question Bank variants out of the user-facing bank,
-- repair authoritative mark totals, and keep the audit current after future imports.

alter table public.dp_qb_question_variants
  add column if not exists render_status text not null default 'ready'
    check (render_status in ('ready', 'quarantined')),
  add column if not exists render_issue_codes text[] not null default array[]::text[],
  add column if not exists render_audited_at timestamptz;

create index if not exists dp_qb_variants_render_status_idx
  on public.dp_qb_question_variants (render_status, course_id);

-- The bracketed source header is the most authoritative total available for
-- imported multi-part questions. Correct only rows where that header exists.
with parsed_marks as (
  select
    question.id,
    substring(
      question.content
      from '[Mm]aximum[[:space:]]+mark[s]?[[:space:]]*:[[:space:]]*([0-9]+)'
    )::integer as header_mark
  from public.dp_qb_questions question
)
update public.dp_qb_questions question
set maximum_mark = parsed_marks.header_mark,
    updated_at = now()
from parsed_marks
where parsed_marks.id = question.id
  and parsed_marks.header_mark is not null
  and parsed_marks.header_mark <> question.maximum_mark;

-- These five rows are ordinary one-mark multiple-choice questions whose source
-- maximum was imported as a difficulty-style percentage rather than a mark.
update public.dp_qb_questions
set maximum_mark = 1,
    updated_at = now()
where reference in ('BI0604', 'ES0198', 'PH0195', 'PH0366', 'PH0746')
  and mark_scheme ~* ':answer\[\*\*[A-D]\*\*\]'
  and maximum_mark <> 1;

-- Remove the two known orphan math-delimiter lines at source level as well as
-- handling them defensively in the renderer.
update public.dp_qb_questions
set content = replace(content, E'\n$ \n', E'\n'),
    updated_at = now()
where reference = 'PH0702'
  and content like E'%\n$ \n%';

update public.dp_qb_questions
set content = replace(content, E'mol^{-1}\n$\n', E'mol^{-1}$\n'),
    updated_at = now()
where reference = 'CH0305'
  and content like E'%mol^{-1}\n$\n%';

update public.dp_qb_question_search search_document
set search_text = replace(search_document.search_text, E'\n$ \n', E'\n'),
    updated_at = now()
from public.dp_qb_question_variants variant
join public.dp_qb_questions question on question.id = variant.question_id
where search_document.variant_id = variant.id
  and question.reference = 'PH0702'
  and search_document.search_text like E'%\n$ \n%';

update public.dp_qb_question_search search_document
set search_text = replace(search_document.search_text, E'mol^{-1}\n$\n', E'mol^{-1}$\n'),
    updated_at = now()
from public.dp_qb_question_variants variant
join public.dp_qb_questions question on question.id = variant.question_id
where search_document.variant_id = variant.id
  and question.reference = 'CH0305'
  and search_document.search_text like E'%mol^{-1}\n$\n%';

create or replace function private.dp_qb_variant_render_issue_codes(p_variant_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with variant_question as (
    select
      variant.id as variant_id,
      question.content,
      question.mark_scheme,
      question.examiner_report
    from public.dp_qb_question_variants variant
    join public.dp_qb_questions question on question.id = variant.question_id
    where variant.id = p_variant_id
  ),
  source_fields as (
    select variant_id, 'question'::text as role, coalesce(content, '') as source
    from variant_question
    union all
    select variant_id, 'markscheme', coalesce(mark_scheme, '')
    from variant_question
    union all
    select variant_id, 'examiner_report', coalesce(examiner_report, '')
    from variant_question
  ),
  referenced_images as (
    select
      source_fields.variant_id,
      source_fields.role,
      (image_match)[1]::uuid as source_file_id
    from source_fields
    cross join lateral regexp_matches(
      source_fields.source,
      'question:([0-9a-fA-F-]{36})',
      'g'
    ) as image_match
  ),
  issues as (
    select 'blank_question_content'::text as issue
    from variant_question
    where btrim(coalesce(content, '')) = ''

    union all

    select 'protected_render_token_leak'
    from variant_question
    where content like '%DPQBPROTECTEDTOKEN%'
       or mark_scheme like '%DPQBPROTECTEDTOKEN%'
       or examiner_report like '%DPQBPROTECTEDTOKEN%'

    union all

    select 'missing_' || referenced_images.role || '_image'
    from referenced_images
    left join public.dp_qb_variant_assets variant_asset
      on variant_asset.variant_id = referenced_images.variant_id
     and variant_asset.source_file_id = referenced_images.source_file_id
     and variant_asset.role = referenced_images.role
    where variant_asset.asset_id is null

    union all

    select 'unverified_' || referenced_images.role || '_image'
    from referenced_images
    join public.dp_qb_variant_assets variant_asset
      on variant_asset.variant_id = referenced_images.variant_id
     and variant_asset.source_file_id = referenced_images.source_file_id
     and variant_asset.role = referenced_images.role
    join public.dp_qb_assets asset on asset.id = variant_asset.asset_id
    where asset.upload_status <> 'uploaded'
       or asset.verification_status <> 'verified'
  )
  select coalesce(
    array_agg(distinct issues.issue order by issues.issue),
    array[]::text[]
  )
  from issues;
$$;

create or replace function private.dp_qb_audit_variant(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  issues text[];
begin
  issues := private.dp_qb_variant_render_issue_codes(p_variant_id);

  update public.dp_qb_question_variants
  set render_status = case
        when cardinality(issues) = 0 then 'ready'
        else 'quarantined'
      end,
      render_issue_codes = issues,
      render_audited_at = now()
  where id = p_variant_id;
end;
$$;

create or replace function private.dp_qb_audit_question_variants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  variant_row record;
begin
  for variant_row in
    select id
    from public.dp_qb_question_variants
    where question_id = new.id
  loop
    perform private.dp_qb_audit_variant(variant_row.id);
  end loop;
  return new;
end;
$$;

create or replace function private.dp_qb_audit_changed_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.dp_qb_audit_variant(new.id);
  return new;
end;
$$;

create or replace function private.dp_qb_audit_variant_asset_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.dp_qb_audit_variant(coalesce(new.variant_id, old.variant_id));
  return coalesce(new, old);
end;
$$;

create or replace function private.dp_qb_audit_asset_variants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  variant_row record;
begin
  for variant_row in
    select distinct variant_id as id
    from public.dp_qb_variant_assets
    where asset_id = new.id
  loop
    perform private.dp_qb_audit_variant(variant_row.id);
  end loop;
  return new;
end;
$$;

revoke all on function private.dp_qb_variant_render_issue_codes(uuid) from public;
revoke all on function private.dp_qb_audit_variant(uuid) from public;
revoke all on function private.dp_qb_audit_question_variants() from public;
revoke all on function private.dp_qb_audit_changed_variant() from public;
revoke all on function private.dp_qb_audit_variant_asset_change() from public;
revoke all on function private.dp_qb_audit_asset_variants() from public;

drop trigger if exists dp_qb_audit_question_variants on public.dp_qb_questions;
create trigger dp_qb_audit_question_variants
after insert or update of content, mark_scheme, examiner_report
on public.dp_qb_questions
for each row execute function private.dp_qb_audit_question_variants();

drop trigger if exists dp_qb_audit_changed_variant on public.dp_qb_question_variants;
create trigger dp_qb_audit_changed_variant
after insert or update of question_id
on public.dp_qb_question_variants
for each row execute function private.dp_qb_audit_changed_variant();

drop trigger if exists dp_qb_audit_variant_asset_change on public.dp_qb_variant_assets;
create trigger dp_qb_audit_variant_asset_change
after insert or update or delete
on public.dp_qb_variant_assets
for each row execute function private.dp_qb_audit_variant_asset_change();

drop trigger if exists dp_qb_audit_asset_variants on public.dp_qb_assets;
create trigger dp_qb_audit_asset_variants
after update of upload_status, verification_status
on public.dp_qb_assets
for each row execute function private.dp_qb_audit_asset_variants();

-- Audit every existing variant once. Subsequent imports and asset changes are
-- covered by the triggers above.
do $audit$
declare
  variant_row record;
begin
  for variant_row in select id from public.dp_qb_question_variants loop
    perform private.dp_qb_audit_variant(variant_row.id);
  end loop;
end
$audit$;

-- Security-definer listing/search functions must explicitly exclude quarantined
-- variants because they execute as their owner and therefore bypass row policies.
create or replace function public.dp_qb_course_filter_options(p_course_id uuid)
returns table(difficulties text[], sections text[], calculator_values boolean[])
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
  with course_variants as (
    select
      nullif(btrim(variant.difficulty_label), '') as difficulty,
      nullif(btrim(variant.section_normalized), '') as section,
      variant.calculator_allowed
    from public.dp_qb_question_variants variant
    where variant.course_id = p_course_id
      and variant.render_status = 'ready'
  ),
  difficulty_values as (
    select distinct
      course_variants.difficulty,
      case lower(course_variants.difficulty)
        when 'easy' then 1
        when 'medium' then 2
        when 'hard' then 3
        else 99
      end as sort_order
    from course_variants
    where course_variants.difficulty is not null
  ),
  section_values as (
    select distinct course_variants.section
    from course_variants
    where course_variants.section is not null
  ),
  calculator_value_options as (
    select distinct course_variants.calculator_allowed
    from course_variants
    where course_variants.calculator_allowed is not null
  )
  select
    coalesce(
      (select array_agg(difficulty_values.difficulty order by difficulty_values.sort_order, difficulty_values.difficulty)
       from difficulty_values),
      array[]::text[]
    ),
    coalesce(
      (select array_agg(section_values.section order by section_values.section)
       from section_values),
      array[]::text[]
    ),
    coalesce(
      (select array_agg(calculator_value_options.calculator_allowed order by calculator_value_options.calculator_allowed)
       from calculator_value_options),
      array[]::boolean[]
    );
end;
$$;

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
      left(regexp_replace(question.content, '\s+', ' ', 'g'), 280) as content_preview,
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
      and variant.render_status = 'ready'
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
    count(*) over()
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
    left(regexp_replace(question.content, '\s+', ' ', 'g'), 280),
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
  where variant.render_status = 'ready'
    and (
      search_document.search_vector @@ websearch_to_tsquery('simple', p_query)
      or question.reference ilike '%' || p_query || '%'
    )
  order by ts_rank(search_document.search_vector, websearch_to_tsquery('simple', p_query)) desc,
    question.reference,
    variant.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.dp_qb_question_neighbors(p_variant_id uuid)
returns table(previous_variant_id uuid, next_variant_id uuid)
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
      and render_status = 'ready'
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
      and variant.render_status = 'ready'
  )
  select ordered.previous_id, ordered.next_id
  from ordered
  where ordered.id = p_variant_id;
end;
$$;

-- Direct authenticated reads (including recent-question hydration and direct
-- question URLs) also fail closed for quarantined variants. Admins retain access
-- for diagnosis in the operations area.
drop policy if exists "question bank eligible member read" on public.dp_qb_question_variants;
create policy "question bank eligible member read"
on public.dp_qb_question_variants
for select
to authenticated
using (
  (select private.dp_qb_has_access())
  and (
    render_status = 'ready'
    or (select private.dp_qb_is_admin())
  )
);

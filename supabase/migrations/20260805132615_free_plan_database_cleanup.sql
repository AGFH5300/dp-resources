-- Keep DP Resources within the Supabase Free Plan without deleting canonical
-- Question Bank content or another member's practice progress.
--
-- 1. Search now runs directly against canonical question data and the existing
--    GIN expression index on dp_qb_questions.
-- 2. The importer-facing dp_qb_question_search relation remains as a compact
--    compatibility sink, but no longer stores duplicated search documents.
-- 3. Abandoned practice builds can be deleted immediately on disconnect and
--    are pruned after a conservative stale interval.

set lock_timeout = '10s';
set statement_timeout = '180s';

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
  safe_page_size integer :=
    least(greatest(coalesce(p_page_size, 24), 1), 100);
  normalized_query text := nullif(btrim(coalesce(p_query, '')), '');
  query_pattern text :=
    case
      when nullif(btrim(coalesce(p_query, '')), '') is null then null
      else '%' || btrim(p_query) || '%'
    end;
  query_ts tsquery :=
    case
      when nullif(btrim(coalesce(p_query, '')), '') is null then null
      else websearch_to_tsquery('simple', p_query)
    end;
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
      left(regexp_replace(question.content, '\s+', ' ', 'g'), 280)
        as content_preview,
      question.maximum_mark,
      variant.difficulty_value,
      variant.difficulty_label,
      coalesce(variant.section_raw, variant.section_normalized) as section,
      variant.calculator_allowed,
      primary_topic.id as topic_id,
      private.dp_qb_variant_topic_names(variant.id) as topic_name,
      paper.id as paper_id,
      paper.reference as paper_reference,
      private.dp_qb_variant_canonical_subtopics(variant.id)
        as subtopic_names,
      coalesce(progress.status, 'not_started') as progress_status,
      coalesce(progress.to_revisit, false) as to_revisit,
      saved.question_id is not null as is_saved,
      primary_topic.sort_order,
      variant.source_index
    from public.dp_qb_question_variants variant
    join public.dp_qb_questions question on question.id = variant.question_id
    join public.dp_qb_topics primary_topic
      on primary_topic.id = variant.topic_id
    join public.dp_qb_courses course on course.id = variant.course_id
    join public.dp_qb_subjects subject on subject.id = course.subject_id
    left join public.dp_qb_papers paper on paper.id = variant.paper_id
    left join public.dp_qb_user_progress progress
      on progress.user_id = requesting_user
     and progress.question_id = question.id
    left join public.dp_qb_user_saved_questions saved
      on saved.user_id = requesting_user
     and saved.question_id = question.id
    where variant.course_id = p_course_id
      and variant.render_status = 'ready'
      and (
        p_topic_id is null
        or exists (
          select 1
          from public.dp_qb_variant_topics membership
          where membership.variant_id = variant.id
            and membership.topic_id = p_topic_id
        )
      )
      and (
        p_subtopic_id is null
        or private.dp_qb_variant_has_canonical_subtopic(
          variant.id,
          (
            select selected.canonical_key
            from public.dp_qb_subtopics selected
            where selected.id = p_subtopic_id
              and selected.course_id = p_course_id
          ),
          (
            select parent.canonical_key
            from public.dp_qb_subtopics selected
            join public.dp_qb_topics parent
              on parent.id = selected.topic_id
            where selected.id = p_subtopic_id
              and selected.course_id = p_course_id
          )
        )
      )
      and (
        p_difficulty is null
        or variant.difficulty_label = lower(p_difficulty)
      )
      and (p_paper_id is null or variant.paper_id = p_paper_id)
      and (
        p_section is null
        or variant.section_normalized = upper(p_section)
      )
      and (
        p_calculator is null
        or variant.calculator_allowed = p_calculator
      )
      and (
        p_status is null
        or coalesce(progress.status, 'not_started') = p_status
      )
      and (
        p_saved is null
        or (saved.question_id is not null) = p_saved
      )
      and (
        p_revisit is null
        or coalesce(progress.to_revisit, false) = p_revisit
      )
      and (
        normalized_query is null
        or to_tsvector(
          'simple',
          coalesce(question.reference, '') || ' ' || coalesce(question.content, '')
        ) @@ query_ts
        or question.reference ilike query_pattern
        or course.name ilike query_pattern
        or course.slug ilike query_pattern
        or subject.name ilike query_pattern
        or subject.slug ilike query_pattern
        or primary_topic.name ilike query_pattern
        or paper.reference ilike query_pattern
        or array_to_string(
          private.dp_qb_variant_canonical_subtopics(variant.id),
          ' '
        ) ilike query_pattern
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
declare
  normalized_query text := btrim(coalesce(p_query, ''));
  query_pattern text := '%' || btrim(coalesce(p_query, '')) || '%';
  query_ts tsquery := websearch_to_tsquery('simple', coalesce(p_query, ''));
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;
  if char_length(normalized_query) < 2 then
    return;
  end if;

  return query
  with ranked as (
    select
      variant.id as variant_id,
      question.id as question_id,
      question.reference,
      left(regexp_replace(question.content, '\s+', ' ', 'g'), 280)
        as content_preview,
      question.maximum_mark,
      subject.slug as subject_slug,
      subject.name as subject_name,
      course.slug as course_slug,
      course.name as course_name,
      private.dp_qb_variant_topic_names(variant.id) as topic_name,
      private.dp_qb_variant_canonical_subtopics(variant.id)
        as subtopic_names,
      paper.reference as paper_reference,
      variant.difficulty_label,
      (
        ts_rank(
          to_tsvector(
            'simple',
            coalesce(question.reference, '') || ' ' || coalesce(question.content, '')
          ),
          query_ts
        )
        + case when lower(question.reference) = lower(normalized_query) then 5 else 0 end
        + case when question.reference ilike query_pattern then 1 else 0 end
        + case when course.name ilike query_pattern then 0.35 else 0 end
        + case when subject.name ilike query_pattern then 0.35 else 0 end
        + case when private.dp_qb_variant_topic_names(variant.id) ilike query_pattern
            then 0.3 else 0 end
        + case when array_to_string(
            private.dp_qb_variant_canonical_subtopics(variant.id),
            ' '
          ) ilike query_pattern then 0.25 else 0 end
        + case when paper.reference ilike query_pattern then 0.2 else 0 end
      ) as relevance
    from public.dp_qb_question_variants variant
    join public.dp_qb_questions question on question.id = variant.question_id
    join public.dp_qb_courses course on course.id = variant.course_id
    join public.dp_qb_subjects subject on subject.id = course.subject_id
    left join public.dp_qb_papers paper on paper.id = variant.paper_id
    where variant.render_status = 'ready'
      and (
        to_tsvector(
          'simple',
          coalesce(question.reference, '') || ' ' || coalesce(question.content, '')
        ) @@ query_ts
        or question.reference ilike query_pattern
        or course.name ilike query_pattern
        or course.slug ilike query_pattern
        or subject.name ilike query_pattern
        or subject.slug ilike query_pattern
        or paper.reference ilike query_pattern
        or private.dp_qb_variant_topic_names(variant.id) ilike query_pattern
        or array_to_string(
          private.dp_qb_variant_canonical_subtopics(variant.id),
          ' '
        ) ilike query_pattern
      )
  )
  select
    ranked.variant_id,
    ranked.question_id,
    ranked.reference,
    ranked.content_preview,
    ranked.maximum_mark,
    ranked.subject_slug,
    ranked.subject_name,
    ranked.course_slug,
    ranked.course_name,
    ranked.topic_name,
    ranked.subtopic_names,
    ranked.paper_reference,
    ranked.difficulty_label,
    count(*) over()
  from ranked
  order by ranked.relevance desc, ranked.reference, ranked.variant_id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- The old table duplicated tens of megabytes of question content and a stored
-- tsvector. Runtime search no longer depends on it, but importers still upsert
-- this relation. Recreate it as a tiny compatibility sink and discard payloads.
drop table public.dp_qb_question_search;

create table public.dp_qb_question_search (
  variant_id uuid primary key
    references public.dp_qb_question_variants(id) on delete cascade,
  search_text text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function private.dp_qb_compact_importer_search_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.search_text := '';
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

create trigger dp_qb_compact_importer_search_document
before insert or update on public.dp_qb_question_search
for each row execute function private.dp_qb_compact_importer_search_document();

alter table public.dp_qb_question_search enable row level security;
create policy "question bank eligible member read"
  on public.dp_qb_question_search for select to authenticated
  using ((select private.dp_qb_has_access()));
revoke all on table public.dp_qb_question_search from public, anon, authenticated;
grant select on table public.dp_qb_question_search to authenticated;
grant all on table public.dp_qb_question_search to service_role;

comment on table public.dp_qb_question_search is
  'Compact importer compatibility sink. Runtime search reads canonical Question Bank tables; search_text is intentionally discarded.';

-- Remove a duplicate non-unique index; the unique content-hash index remains.
drop index if exists public.dp_qb_questions_content_hash_idx;

create or replace function public.dp_qb_cleanup_abandoned_practice_sessions(
  p_user_id uuid,
  p_active_session_id uuid default null,
  p_stale_after_minutes integer default 15
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
  stale_minutes integer :=
    least(greatest(coalesce(p_stale_after_minutes, 15), 5), 1440);
begin
  if p_user_id is null then
    raise exception 'Practice-session user is required' using errcode = '22023';
  end if;

  delete from public.dp_qb_practice_sessions session
  where session.user_id = p_user_id
    and session.status = 'building'
    and (p_active_session_id is null or session.id <> p_active_session_id)
    and session.updated_at < now() - make_interval(mins => stale_minutes);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.dp_qb_delete_abandoned_practice_session(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if p_user_id is null or p_session_id is null then
    return false;
  end if;

  delete from public.dp_qb_practice_sessions session
  where session.id = p_session_id
    and session.user_id = p_user_id
    and session.status = 'building';

  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.dp_qb_cleanup_abandoned_practice_sessions(
  uuid, uuid, integer
) from public, anon, authenticated;
revoke all on function public.dp_qb_delete_abandoned_practice_session(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.dp_qb_cleanup_abandoned_practice_sessions(
  uuid, uuid, integer
) to service_role;
grant execute on function public.dp_qb_delete_abandoned_practice_session(
  uuid, uuid
) to service_role;

create or replace function private.dp_qb_prune_stale_builds_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.dp_qb_cleanup_abandoned_practice_sessions(
    new.user_id,
    null,
    15
  );
  return new;
end;
$$;

drop trigger if exists dp_qb_prune_stale_builds_before_insert
  on public.dp_qb_practice_sessions;
create trigger dp_qb_prune_stale_builds_before_insert
before insert on public.dp_qb_practice_sessions
for each row execute function private.dp_qb_prune_stale_builds_before_insert();

comment on function public.dp_qb_cleanup_abandoned_practice_sessions(
  uuid, uuid, integer
) is 'Deletes only stale building sessions belonging to the supplied user.';
comment on function public.dp_qb_delete_abandoned_practice_session(
  uuid, uuid
) is 'Deletes one interrupted building session only when both user and session IDs match.';

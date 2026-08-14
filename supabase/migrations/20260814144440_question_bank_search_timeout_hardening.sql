-- Prevent malformed or broad global Question Bank searches from scanning every
-- ready variant and timing out. Build an indexed candidate set first, then load
-- question content and taxonomy labels only for the final page.

create extension if not exists pg_trgm with schema extensions;

create index if not exists dp_qb_questions_reference_trgm_idx
  on public.dp_qb_questions using gin (reference extensions.gin_trgm_ops);

create or replace function public.dp_qb_search_questions(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_source_slugs text[] default null
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
  normalized_query text := left(btrim(coalesce(p_query, '')), 160);
  escaped_query text;
  query_pattern text;
  query_ts tsquery;
  safe_source_slugs text[] := array[]::text[];
  bounded_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  bounded_offset integer := least(greatest(coalesce(p_offset, 0), 0), 30000);
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  if char_length(normalized_query) < 2 then
    return;
  end if;

  select coalesce(array_agg(requested.slug), array[]::text[])
  into safe_source_slugs
  from (
    select lower(value) as slug
    from unnest(coalesce(p_source_slugs, array[]::text[])) as item(value)
    where value ~ '^[A-Za-z0-9_]+$'
    limit 10
  ) requested;

  escaped_query := replace(
    replace(replace(normalized_query, E'\\', E'\\\\'), '%', E'\\%'),
    '_',
    E'\\_'
  );
  query_pattern := '%' || escaped_query || '%';
  query_ts := websearch_to_tsquery('simple', normalized_query);

  return query
  with selected_source_variants as materialized (
    select distinct provenance.variant_id
    from public.dp_qb_variant_sources provenance
    join public.dp_content_sources source on source.id = provenance.source_id
    where cardinality(safe_source_slugs) > 0
      and provenance.review_status <> 'rejected'
      and source.is_active
      and source.slug = any(safe_source_slugs)
  ),
  question_matches as materialized (
    select
      question.id as question_id,
      ts_rank(
        to_tsvector(
          'simple',
          coalesce(question.reference, '') || ' ' || coalesce(question.content, '')
        ),
        query_ts
      )::double precision as relevance
    from public.dp_qb_questions question
    where to_tsvector(
      'simple',
      coalesce(question.reference, '') || ' ' || coalesce(question.content, '')
    ) @@ query_ts

    union all

    select
      question.id,
      case
        when lower(question.reference) = lower(normalized_query) then 6::double precision
        else 1::double precision
      end
    from public.dp_qb_questions question
    where char_length(normalized_query) >= 3
      and question.reference ilike query_pattern escape E'\\'

    union all

    select question.id, 6::double precision
    from public.dp_qb_questions question
    where char_length(normalized_query) < 3
      and question.reference = normalized_query
  ),
  course_matches as materialized (
    select course.id, 0.35::double precision as relevance
    from public.dp_qb_courses course
    where course.name ilike query_pattern escape E'\\'
       or course.slug ilike query_pattern escape E'\\'
  ),
  subject_matches as materialized (
    select subject.id, 0.35::double precision as relevance
    from public.dp_qb_subjects subject
    where subject.name ilike query_pattern escape E'\\'
       or subject.slug ilike query_pattern escape E'\\'
  ),
  paper_matches as materialized (
    select paper.id, 0.2::double precision as relevance
    from public.dp_qb_papers paper
    where paper.reference ilike query_pattern escape E'\\'
  ),
  topic_matches as materialized (
    select topic.id, 0.3::double precision as relevance
    from public.dp_qb_topics topic
    where topic.name ilike query_pattern escape E'\\'
       or topic.slug ilike query_pattern escape E'\\'
  ),
  subtopic_matches as materialized (
    select subtopic.id, 0.25::double precision as relevance
    from public.dp_qb_subtopics subtopic
    where coalesce(subtopic.canonical_name, subtopic.name)
            ilike query_pattern escape E'\\'
       or subtopic.name ilike query_pattern escape E'\\'
       or subtopic.slug ilike query_pattern escape E'\\'
       or coalesce(subtopic.code, '') ilike query_pattern escape E'\\'
  ),
  candidate_hits as materialized (
    select variant.id as variant_id, variant.question_id, match.relevance
    from question_matches match
    join public.dp_qb_question_variants variant
      on variant.question_id = match.question_id
    where variant.render_status = 'ready'

    union all

    select variant.id, variant.question_id, match.relevance
    from course_matches match
    join public.dp_qb_question_variants variant on variant.course_id = match.id
    where variant.render_status = 'ready'

    union all

    select variant.id, variant.question_id, match.relevance
    from subject_matches match
    join public.dp_qb_courses course on course.subject_id = match.id
    join public.dp_qb_question_variants variant on variant.course_id = course.id
    where variant.render_status = 'ready'

    union all

    select variant.id, variant.question_id, match.relevance
    from paper_matches match
    join public.dp_qb_question_variants variant on variant.paper_id = match.id
    where variant.render_status = 'ready'

    union all

    select membership.variant_id, variant.question_id, match.relevance
    from topic_matches match
    join public.dp_qb_variant_topics membership on membership.topic_id = match.id
    join public.dp_qb_question_variants variant on variant.id = membership.variant_id
    where variant.render_status = 'ready'

    union all

    select variant.id, variant.question_id, match.relevance
    from topic_matches match
    join public.dp_qb_question_variants variant on variant.topic_id = match.id
    where variant.render_status = 'ready'

    union all

    select placement.variant_id, variant.question_id, match.relevance
    from subtopic_matches match
    join public.dp_qb_question_subtopics placement on placement.subtopic_id = match.id
    join public.dp_qb_question_variants variant on variant.id = placement.variant_id
    where variant.render_status = 'ready'
  ),
  candidates as materialized (
    select
      candidate.variant_id,
      candidate.question_id,
      max(candidate.relevance) as relevance
    from candidate_hits candidate
    where cardinality(safe_source_slugs) = 0
       or exists (
         select 1
         from selected_source_variants selected
         where selected.variant_id = candidate.variant_id
       )
    group by candidate.variant_id, candidate.question_id
  ),
  ranked as materialized (
    select
      candidate.*,
      row_number() over (
        partition by candidate.question_id
        order by candidate.relevance desc, candidate.variant_id
      ) as core_rank
    from candidates candidate
  ),
  deduped as materialized (
    select
      ranked.variant_id,
      ranked.question_id,
      ranked.relevance,
      question.reference,
      count(*) over() as total_count
    from ranked
    join public.dp_qb_questions question on question.id = ranked.question_id
    where ranked.core_rank = 1
  ),
  requested_page as materialized (
    select deduped.*
    from deduped
    order by deduped.relevance desc, deduped.reference, deduped.variant_id
    limit bounded_limit
    offset bounded_offset
  )
  select
    requested_page.variant_id,
    requested_page.question_id,
    question.reference,
    left(regexp_replace(question.content, '\\s+', ' ', 'g'), 280) as content_preview,
    question.maximum_mark,
    subject.slug as subject_slug,
    subject.name as subject_name,
    course.slug as course_slug,
    course.name as course_name,
    private.dp_qb_variant_topic_names(requested_page.variant_id) as topic_name,
    private.dp_qb_variant_canonical_subtopics(requested_page.variant_id) as subtopic_names,
    paper.reference as paper_reference,
    variant.difficulty_label,
    requested_page.total_count
  from requested_page
  join public.dp_qb_question_variants variant on variant.id = requested_page.variant_id
  join public.dp_qb_questions question on question.id = requested_page.question_id
  join public.dp_qb_courses course on course.id = variant.course_id
  join public.dp_qb_subjects subject on subject.id = course.subject_id
  left join public.dp_qb_papers paper on paper.id = variant.paper_id
  order by requested_page.relevance desc, requested_page.reference, requested_page.variant_id;
end;
$$;

revoke execute on function public.dp_qb_search_questions(text, integer, integer, text[])
  from public, anon;
grant execute on function public.dp_qb_search_questions(text, integer, integer, text[])
  to authenticated, service_role;

-- Let the question bank filter by a paper family (all Paper 1s, all Paper 2s,
-- etc.) or by an exact paper reference across duplicate source-specific paper
-- rows. The existing UUID filter remains for backwards-compatible URLs.

drop function if exists public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean,
  integer, integer, text[]
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
  p_source_slugs text[] default null,
  p_paper_number integer default null,
  p_paper_reference text default null
)
returns table(
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
as $function$
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
      variant.id as variant_id,
      question.id as question_id,
      question.reference,
      left(regexp_replace(question.content, '\s+', ' ', 'g'), 280) as content_preview,
      question.maximum_mark,
      variant.difficulty_value,
      variant.difficulty_label,
      coalesce(variant.section_raw, variant.section_normalized) as section,
      variant.calculator_allowed,
      primary_topic.id as topic_id,
      private.dp_qb_variant_topic_names(variant.id) as topic_name,
      paper.id as paper_id,
      paper.reference as paper_reference,
      private.dp_qb_variant_canonical_subtopics(variant.id) as subtopic_names,
      coalesce(progress.status, 'not_started') as progress_status,
      coalesce(progress.to_revisit, false) as to_revisit,
      saved.question_id is not null as is_saved,
      primary_topic.sort_order,
      variant.source_index
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
        select 1
        from public.dp_qb_variant_topics membership
        where membership.variant_id = variant.id
          and membership.topic_id = p_topic_id
      ))
      and (p_subtopic_id is null or private.dp_qb_variant_has_canonical_subtopic(
        variant.id,
        (select selected.canonical_key
         from public.dp_qb_subtopics selected
         where selected.id = p_subtopic_id and selected.course_id = p_course_id),
        (select parent.canonical_key
         from public.dp_qb_subtopics selected
         join public.dp_qb_topics parent on parent.id = selected.topic_id
         where selected.id = p_subtopic_id and selected.course_id = p_course_id)
      ))
      and (p_difficulty is null or variant.difficulty_label = lower(p_difficulty))
      and (p_paper_id is null or variant.paper_id = p_paper_id)
      and (
        p_paper_reference is null
        or lower(paper.reference) = lower(p_paper_reference)
      )
      and (
        p_paper_number is null
        or substring(
          lower(coalesce(paper.reference, ''))
          from 'paper[[:space:]]+([0-9]+)'
        )::integer = p_paper_number
      )
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
          private.dp_qb_variant_canonical_subtopics(variant.id), ' '
        ) ilike query_pattern
      )
  ), deduped as (
    select
      filtered.*,
      row_number() over (
        partition by filtered.question_id
        order by filtered.sort_order, filtered.source_index, filtered.variant_id
      ) as core_rank
    from filtered
  )
  select
    deduped.variant_id,
    deduped.question_id,
    deduped.reference,
    deduped.content_preview,
    deduped.maximum_mark,
    deduped.difficulty_value,
    deduped.difficulty_label,
    deduped.section,
    deduped.calculator_allowed,
    deduped.topic_id,
    deduped.topic_name,
    deduped.paper_id,
    deduped.paper_reference,
    deduped.subtopic_names,
    deduped.progress_status,
    deduped.to_revisit,
    deduped.is_saved,
    count(*) over()
  from deduped
  where deduped.core_rank = 1
  order by deduped.sort_order, deduped.source_index, deduped.variant_id
  limit safe_page_size offset (safe_page - 1) * safe_page_size;
end;
$function$;

revoke all on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean,
  integer, integer, text[], integer, text
) from public;

grant execute on function public.dp_qb_list_questions(
  uuid, text, uuid, uuid, text, uuid, text, boolean, text, boolean, boolean,
  integer, integer, text[], integer, text
) to authenticated, service_role;

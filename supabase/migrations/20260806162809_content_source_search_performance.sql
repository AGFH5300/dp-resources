-- Build the selected-source variant set once per global search. This avoids a
-- provenance probe for every ready variant while preserving match-any source
-- semantics and question-core deduplication.

create or replace function public.dp_qb_search_questions(
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
  with selected_source_variants as materialized (
    select distinct provenance.variant_id
    from public.dp_qb_variant_sources provenance
    join public.dp_content_sources source on source.id = provenance.source_id
    where coalesce(cardinality(p_source_slugs), 0) > 0
      and provenance.review_status <> 'rejected'
      and source.is_active
      and source.slug = any(p_source_slugs)
  ), matches as (
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
      and (coalesce(cardinality(p_source_slugs), 0) = 0 or variant.id in (
        select selected.variant_id from selected_source_variants selected
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

revoke execute on function public.dp_qb_search_questions(text, integer, integer, text[])
  from public, anon;
grant execute on function public.dp_qb_search_questions(text, integer, integer, text[])
  to authenticated, service_role;

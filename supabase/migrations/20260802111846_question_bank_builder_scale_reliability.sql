-- Keep catalogue loading and very large multi-subject candidate requests inside
-- narrowly scoped API timeouts. Source questions, variants, assets and taxonomy
-- are read only throughout this migration.

set lock_timeout = '10s';
set statement_timeout = '300s';

create temporary table _dp_qb_builder_protected_counts on commit drop as
select
  (select count(*) from public.dp_qb_questions) as questions,
  (select count(*) from public.dp_qb_question_variants) as variants,
  (select count(*) from public.dp_qb_topics) as source_topics,
  (select count(*) from public.dp_qb_subtopics) as subtopics,
  (select count(*) from public.dp_qb_assets) as assets;

-- Resolve every approved concept in one set-based pass. The previous lateral
-- function call repeated the same mapping work for each concept and approached
-- the authenticated role's eight-second API timeout under load.
create or replace function public.dp_qb_practice_concept_availability()
returns table (
  concept_id uuid,
  course_id uuid,
  question_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  return query
  with mapped_variants as (
    select membership.concept_id, placement.variant_id
    from public.dp_qb_concept_topic_memberships membership
    join public.dp_qb_variant_topics placement
      on placement.topic_id = membership.topic_id

    union

    select membership.concept_id, placement.variant_id
    from public.dp_qb_concept_subtopic_memberships membership
    join public.dp_qb_question_subtopics placement
      on placement.subtopic_id = membership.subtopic_id

    union

    select override.concept_id, override.variant_id
    from public.dp_qb_concept_variant_overrides override
    where override.action = 'include'
  ), eligible as (
    select distinct
      mapped.concept_id,
      variant.course_id,
      variant.question_id
    from mapped_variants mapped
    join public.dp_qb_concepts concept
      on concept.id = mapped.concept_id
     and concept.status = 'approved'
    join public.dp_qb_question_variants variant
      on variant.id = mapped.variant_id
     and variant.render_status = 'ready'
    where not exists (
      select 1
      from public.dp_qb_concept_variant_overrides excluded
      where excluded.concept_id = mapped.concept_id
        and excluded.variant_id = mapped.variant_id
        and excluded.action = 'exclude'
    )
  )
  select
    eligible.concept_id,
    eligible.course_id,
    count(distinct eligible.question_id)::bigint
  from eligible
  group by eligible.concept_id, eligible.course_id
  order by eligible.concept_id, eligible.course_id;
end;
$$;

revoke execute on function public.dp_qb_practice_concept_availability()
  from public, anon;
grant execute on function public.dp_qb_practice_concept_availability()
  to authenticated;

-- A consolidated student-facing label can represent equivalent source concepts
-- from different syllabuses. Accept conceptIds while retaining conceptId for all
-- existing saved configurations and share codes.
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

-- Candidate JSON is service-role-only and can legitimately exceed the website
-- role's eight-second connection default for cold, all-subject requests.
alter function public.dp_qb_practice_candidate_payload(uuid, jsonb)
  set statement_timeout = '30s';

do $$
declare
  before_counts record;
begin
  select * into before_counts from _dp_qb_builder_protected_counts;
  if (select count(*) from public.dp_qb_questions) <> before_counts.questions
     or (select count(*) from public.dp_qb_question_variants) <> before_counts.variants
     or (select count(*) from public.dp_qb_topics) <> before_counts.source_topics
     or (select count(*) from public.dp_qb_subtopics) <> before_counts.subtopics
     or (select count(*) from public.dp_qb_assets) <> before_counts.assets then
    raise exception 'Builder reliability migration changed protected Question Bank data';
  end if;
end;
$$;


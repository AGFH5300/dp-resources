-- Clean student-facing source-topic concepts and make large practice previews
-- return one representative variant per block/question core.

set lock_timeout = '10s';
set statement_timeout = '300s';

-- Composite source rows such as "Molecular Biology, Plant Biology" are import
-- memberships, not real student-facing topics. Archive them only when every
-- comma-separated part already exists as its own topic in the same subject.
with source_concepts as (
  select concept.id, concept.subject_id, concept.name
  from public.dp_qb_concepts concept
  where concept.slug like 'source-topic-%'
    and concept.status = 'approved'
), split_parts as (
  select
    concept.id,
    concept.subject_id,
    concept.name,
    btrim(part) as part
  from source_concepts concept
  cross join lateral regexp_split_to_table(
    concept.name,
    ',[[:space:]]+'
  ) part
  where concept.name ~ ',[[:space:]]+'
), composite_concepts as (
  select part.id
  from split_parts part
  group by part.id, part.subject_id, part.name
  having count(*) >= 2
     and count(*) = count(*) filter (
       where exists (
         select 1
         from source_concepts separate
         where separate.subject_id = part.subject_id
           and separate.id <> part.id
           and lower(btrim(separate.name)) = lower(part.part)
       )
     )
)
update public.dp_qb_concepts concept
set status = 'archived',
    updated_at = now()
where concept.id in (select id from composite_concepts)
   or (
     concept.slug like 'source-topic-%'
     and lower(btrim(concept.name)) in (
       'all questions',
       'database',
       'uncategorized',
       'unassigned'
     )
   );

-- Repair visible punctuation/capitalisation without touching source taxonomy.
update public.dp_qb_concepts concept
set name = regexp_replace(
      regexp_replace(
        regexp_replace(concept.name, ',([^[:space:]])', ', \1', 'g'),
        'Metabolism, cell Respiration',
        'Metabolism, Cell Respiration',
        'gi'
      ),
      '\(ahl\)',
      '(AHL)',
      'gi'
    ),
    updated_at = now()
where concept.slug like 'source-topic-%'
  and concept.status = 'approved';

create index if not exists dp_qb_variants_practice_ready_course_question_idx
  on public.dp_qb_question_variants(
    course_id,
    question_id,
    source_index,
    source_occurrence,
    id
  )
  where render_status = 'ready';

create index if not exists dp_qb_question_subtopics_subtopic_variant_idx
  on public.dp_qb_question_subtopics(subtopic_id, variant_id);

create index if not exists dp_qb_concept_variant_overrides_lookup_idx
  on public.dp_qb_concept_variant_overrides(concept_id, action, variant_id);

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
      nullif(item.value ->> 'conceptId', '')::uuid as concept_id,
      nullif(item.value ->> 'courseId', '')::uuid as direct_course_id,
      coalesce(item.value -> 'filters', '{}'::jsonb) as filters,
      item.ordinality::integer - 1 as block_order
    from jsonb_array_elements(p_configuration -> 'blocks')
      with ordinality as item(value, ordinality)
  ),
  allowed_courses as (
    select
      block.block_key,
      block.selection_type,
      block.concept_id,
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
      null::uuid,
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
      allowed.concept_id,
      allowed.course_id,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order,
      membership.variant_id
    from allowed_courses allowed
    join public.dp_qb_concepts concept
      on concept.id = allowed.concept_id
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
      allowed.concept_id,
      allowed.course_id,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order,
      placement.variant_id
    from allowed_courses allowed
    join public.dp_qb_concepts concept
      on concept.id = allowed.concept_id
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
      allowed.concept_id,
      allowed.course_id,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order,
      override.variant_id
    from allowed_courses allowed
    join public.dp_qb_concepts concept
      on concept.id = allowed.concept_id
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

do $$
begin
  if exists (
    select 1
    from public.dp_qb_concepts concept
    where concept.status = 'approved'
      and concept.slug like 'source-topic-%'
      and lower(btrim(concept.name)) in (
        'all questions', 'database', 'uncategorized', 'unassigned'
      )
  ) then
    raise exception 'Generic source-topic concepts remain approved';
  end if;

  if exists (
    select 1
    from public.dp_qb_concepts concept
    where concept.status = 'approved'
      and concept.slug like 'source-topic-%'
      and concept.name ~ ',[[:space:]]+'
      and exists (
        select 1
        from regexp_split_to_table(concept.name, ',[[:space:]]+') part
        where nullif(btrim(part), '') is null
      )
  ) then
    raise exception 'Malformed approved source-topic name detected';
  end if;
end;
$$;

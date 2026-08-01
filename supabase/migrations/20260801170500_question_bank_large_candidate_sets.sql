-- Let shared and custom configurations contain every selected topic rather than
-- retaining the first-release 20-block guard. All eligibility and ownership
-- checks remain unchanged.

set lock_timeout = '10s';
set statement_timeout = '300s';

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
          then block.block_json -> 'courseIds'
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
  eligible_variants as (
    select
      allowed.block_key,
      candidate.variant_id,
      candidate.question_id,
      candidate.course_id,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order
    from allowed_courses allowed
    join public.dp_qb_concepts concept
      on concept.id = allowed.concept_id
     and concept.status = 'approved'
    join public.dp_qb_courses course
      on course.id = allowed.course_id
     and course.subject_id = concept.subject_id
    join lateral private.dp_qb_concept_variant_candidates(concept.id) candidate
      on candidate.course_id = allowed.course_id
    where allowed.selection_type = 'concept'

    union all

    select
      allowed.block_key,
      variant.id,
      variant.question_id,
      variant.course_id,
      allowed.course_priority,
      allowed.filters,
      allowed.block_order
    from allowed_courses allowed
    join public.dp_qb_question_variants variant
      on variant.course_id = allowed.course_id
     and variant.render_status = 'ready'
    where allowed.selection_type = 'course'
  )
  select distinct
    eligible.block_key,
    variant.question_id,
    variant.id,
    variant.course_id,
    eligible.course_priority,
    case
      when exists (
        select 1
        from public.dp_qb_variant_assets association
        join public.dp_qb_assets asset on asset.id = association.asset_id
        where association.variant_id = variant.id
          and asset.verification_status <> 'verified'
      ) then 1
      else 0
    end as variant_priority,
    case coalesce(variant.difficulty_label, 'unrated')
      when 'easy' then 1
      when 'medium' then 2
      when 'hard' then 3
      else 4
    end as difficulty_rank,
    (
      eligible.block_order::bigint * 1000000000000
      + coalesce(variant.source_index, 0)::bigint * 1000
      + coalesce(variant.source_occurrence, 0)::bigint
    ) as stable_order
  from eligible_variants eligible
  join public.dp_qb_question_variants variant on variant.id = eligible.variant_id
  left join public.dp_qb_user_progress progress
    on progress.user_id = p_user_id
   and progress.question_id = variant.question_id
  left join public.dp_qb_user_saved_questions saved
    on saved.user_id = p_user_id
   and saved.question_id = variant.question_id
  where (
      jsonb_array_length(coalesce(eligible.filters -> 'difficulties', '[]'::jsonb)) = 0
      or coalesce(variant.difficulty_label, 'unrated') in (
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
      or (saved.question_id is not null) = (eligible.filters ->> 'saved')::boolean
    )
    and (
      not (eligible.filters ? 'calculator')
      or jsonb_typeof(eligible.filters -> 'calculator') = 'null'
      or variant.calculator_allowed = (eligible.filters ->> 'calculator')::boolean
    );
end;
$$;

revoke execute on function public.dp_qb_practice_candidates(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.dp_qb_practice_candidates(uuid, jsonb)
  to service_role;

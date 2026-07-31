-- Shared candidate query and atomic fixed-session persistence for the Question
-- Bank practice builder. Both preview and generation call the same candidate
-- function so a configuration reported as feasible cannot use different rules
-- during generation.

set lock_timeout = '10s';
set statement_timeout = '180s';

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
     or jsonb_array_length(p_configuration -> 'blocks') < 1
     or jsonb_array_length(p_configuration -> 'blocks') > 20 then
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

create or replace function public.dp_qb_create_practice_session(
  p_user_id uuid,
  p_configuration jsonb,
  p_generation_seed text,
  p_configuration_hash text,
  p_ordering_mode text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_session_id uuid;
  item_count integer;
  requested_count integer;
begin
  if p_user_id is null then
    raise exception 'Practice session user is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_configuration) <> 'object'
     or jsonb_typeof(p_configuration -> 'blocks') <> 'array' then
    raise exception 'Invalid practice session configuration'
      using errcode = '22023';
  end if;
  if p_configuration_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid practice session configuration hash'
      using errcode = '22023';
  end if;
  if char_length(coalesce(p_generation_seed, '')) < 1
     or char_length(p_generation_seed) > 128 then
    raise exception 'Invalid practice generation seed' using errcode = '22023';
  end if;
  if p_ordering_mode not in (
    'mixed',
    'grouped',
    'interleaved',
    'easier_to_harder',
    'source_order'
  ) then
    raise exception 'Invalid practice ordering mode' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Practice session items must be an array'
      using errcode = '22023';
  end if;

  item_count := jsonb_array_length(p_items);
  select coalesce(sum((block.value ->> 'requestedCount')::integer), 0)
  into requested_count
  from jsonb_array_elements(p_configuration -> 'blocks') block(value);

  if item_count < 1 or item_count > 200 or item_count <> requested_count then
    raise exception 'Generated practice item count does not match the request'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select
        (item.value ->> 'position')::integer as position,
        item.value ->> 'questionId' as question_id,
        item.value ->> 'primaryBlockKey' as primary_block_key,
        item.value -> 'matches' as matches
      from jsonb_array_elements(p_items) item(value)
    ) parsed
    group by parsed.position, parsed.question_id
    having count(*) > 1
  ) then
    raise exception 'Practice session positions and questions must be unique'
      using errcode = '23505';
  end if;

  if (
    select count(distinct (item.value ->> 'position')::integer)
    from jsonb_array_elements(p_items) item(value)
  ) <> item_count
  or (
    select min((item.value ->> 'position')::integer)
    from jsonb_array_elements(p_items) item(value)
  ) <> 0
  or (
    select max((item.value ->> 'position')::integer)
    from jsonb_array_elements(p_items) item(value)
  ) <> item_count - 1 then
    raise exception 'Practice session positions must be contiguous from zero'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item(value)
    left join lateral public.dp_qb_practice_candidates(
      p_user_id,
      p_configuration
    ) candidate
      on candidate.block_key = item.value ->> 'primaryBlockKey'
     and candidate.question_id = (item.value ->> 'questionId')::uuid
     and candidate.variant_id = (item.value ->> 'variantId')::uuid
    where candidate.variant_id is null
  ) then
    raise exception 'Generated practice item is not eligible for its primary block'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item(value)
    where jsonb_typeof(item.value -> 'matches') <> 'array'
       or not exists (
         select 1
         from jsonb_array_elements(item.value -> 'matches') matched(value)
         where matched.value ->> 'blockKey' = item.value ->> 'primaryBlockKey'
       )
  ) then
    raise exception 'Every practice item needs its primary block match'
      using errcode = '23514';
  end if;

  insert into public.dp_qb_practice_sessions (
    user_id,
    practice_set_id,
    schema_version,
    configuration_snapshot,
    generation_seed,
    configuration_hash,
    ordering_mode,
    status,
    requested_count,
    generated_count,
    current_position
  ) values (
    p_user_id,
    null,
    1,
    p_configuration,
    p_generation_seed,
    p_configuration_hash,
    p_ordering_mode,
    'generated',
    requested_count,
    item_count,
    0
  ) returning id into new_session_id;

  insert into public.dp_qb_practice_session_items (
    session_id,
    position,
    primary_block_id,
    primary_block_snapshot,
    question_id,
    variant_id,
    status
  )
  select
    new_session_id,
    (item.value ->> 'position')::integer,
    null,
    coalesce(item.value -> 'primaryBlockSnapshot', '{}'::jsonb),
    (item.value ->> 'questionId')::uuid,
    (item.value ->> 'variantId')::uuid,
    'queued'
  from jsonb_array_elements(p_items) item(value)
  order by (item.value ->> 'position')::integer;

  insert into public.dp_qb_practice_session_item_matches (
    session_item_id,
    match_key,
    block_id,
    concept_id,
    match_snapshot,
    is_primary
  )
  select
    session_item.id,
    matched.value ->> 'blockKey',
    null,
    nullif(matched.value ->> 'conceptId', '')::uuid,
    matched.value,
    matched.value ->> 'blockKey' = item.value ->> 'primaryBlockKey'
  from jsonb_array_elements(p_items) item(value)
  join public.dp_qb_practice_session_items session_item
    on session_item.session_id = new_session_id
   and session_item.position = (item.value ->> 'position')::integer
  cross join lateral jsonb_array_elements(item.value -> 'matches') matched(value);

  return new_session_id;
end;
$$;

revoke execute on function public.dp_qb_create_practice_session(
  uuid,
  jsonb,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.dp_qb_create_practice_session(
  uuid,
  jsonb,
  text,
  text,
  text,
  jsonb
) to service_role;

-- Make large fixed practice-session creation scale with the candidate set once,
-- rather than re-running the same candidate query for every generated item.

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
  requested_count bigint;
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
    'mixed', 'grouped', 'interleaved', 'easier_to_harder', 'source_order'
  ) then
    raise exception 'Invalid practice ordering mode' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Practice session items must be an array' using errcode = '22023';
  end if;

  item_count := jsonb_array_length(p_items);
  select coalesce(sum((block.value ->> 'requestedCount')::bigint), 0)
  into requested_count
  from jsonb_array_elements(p_configuration -> 'blocks') block(value);

  if item_count < 1 or item_count::bigint <> requested_count then
    raise exception 'Generated practice item count does not match the request'
      using errcode = '22023';
  end if;
  if requested_count > 2147483647 then
    raise exception 'Practice session exceeds database integer capacity'
      using errcode = '22003';
  end if;

  -- A PostgREST request normally owns one transaction, but dropping first keeps the
  -- function safe if it is invoked more than once in an explicit transaction.
  drop table if exists pg_temp.dp_qb_session_items_stage;
  drop table if exists pg_temp.dp_qb_session_eligible_stage;

  create temporary table pg_temp.dp_qb_session_items_stage (
    item_position integer not null,
    primary_block_key text not null,
    primary_block_snapshot jsonb not null,
    question_id uuid not null,
    variant_id uuid not null,
    matches jsonb not null
  ) on commit drop;

  insert into pg_temp.dp_qb_session_items_stage (
    item_position,
    primary_block_key,
    primary_block_snapshot,
    question_id,
    variant_id,
    matches
  )
  select
    (item.value ->> 'position')::integer,
    item.value ->> 'primaryBlockKey',
    coalesce(item.value -> 'primaryBlockSnapshot', '{}'::jsonb),
    (item.value ->> 'questionId')::uuid,
    (item.value ->> 'variantId')::uuid,
    item.value -> 'matches'
  from jsonb_array_elements(p_items) item(value);

  if (select count(*) from pg_temp.dp_qb_session_items_stage) <> item_count then
    raise exception 'Generated practice item count does not match the request'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.dp_qb_session_items_stage
    group by item_position
    having count(*) > 1
  ) or exists (
    select 1
    from pg_temp.dp_qb_session_items_stage
    group by question_id
    having count(*) > 1
  ) then
    raise exception 'Practice session positions and questions must be unique'
      using errcode = '23505';
  end if;

  if (select min(item_position) from pg_temp.dp_qb_session_items_stage) <> 0
     or (select max(item_position) from pg_temp.dp_qb_session_items_stage) <> item_count - 1 then
    raise exception 'Practice session positions must be contiguous from zero'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.dp_qb_session_items_stage item
    where jsonb_typeof(item.matches) <> 'array'
       or not exists (
         select 1
         from jsonb_array_elements(item.matches) matched(value)
         where matched.value ->> 'blockKey' = item.primary_block_key
       )
  ) then
    raise exception 'Every practice item needs its primary block match'
      using errcode = '23514';
  end if;

  -- This is the critical scalability fix: resolve the complete eligible set once.
  -- The previous lateral join could re-run dp_qb_practice_candidates for each item.
  create temporary table pg_temp.dp_qb_session_eligible_stage
  on commit drop
  as
  select
    candidate.block_key,
    candidate.question_id,
    candidate.variant_id
  from public.dp_qb_practice_candidates(
    p_user_id,
    p_configuration
  ) candidate;

  create index dp_qb_session_eligible_lookup_idx
    on pg_temp.dp_qb_session_eligible_stage (
      block_key,
      question_id,
      variant_id
    );

  if exists (
    select 1
    from pg_temp.dp_qb_session_items_stage item
    left join pg_temp.dp_qb_session_eligible_stage candidate
      on candidate.block_key = item.primary_block_key
     and candidate.question_id = item.question_id
     and candidate.variant_id = item.variant_id
    where candidate.variant_id is null
  ) then
    raise exception 'Generated practice item is not eligible for its primary block'
      using errcode = '23514';
  end if;

  insert into public.dp_qb_practice_sessions (
    user_id, practice_set_id, schema_version, configuration_snapshot,
    generation_seed, configuration_hash, ordering_mode, status,
    requested_count, generated_count, current_position
  ) values (
    p_user_id, null, 1, p_configuration,
    p_generation_seed, p_configuration_hash, p_ordering_mode, 'generated',
    requested_count::integer, item_count, 0
  ) returning id into new_session_id;

  insert into public.dp_qb_practice_session_items (
    session_id, position, primary_block_id, primary_block_snapshot,
    question_id, variant_id, status
  )
  select
    new_session_id,
    item.item_position,
    null,
    item.primary_block_snapshot,
    item.question_id,
    item.variant_id,
    'queued'
  from pg_temp.dp_qb_session_items_stage item
  order by item.item_position;

  insert into public.dp_qb_practice_session_item_matches (
    session_item_id, match_key, block_id, concept_id, match_snapshot, is_primary
  )
  select
    session_item.id,
    matched.value ->> 'blockKey',
    null,
    nullif(matched.value ->> 'conceptId', '')::uuid,
    matched.value,
    matched.value ->> 'blockKey' = item.primary_block_key
  from pg_temp.dp_qb_session_items_stage item
  join public.dp_qb_practice_session_items session_item
    on session_item.session_id = new_session_id
   and session_item.position = item.item_position
  cross join lateral jsonb_array_elements(item.matches) matched(value);

  return new_session_id;
end;
$$;

comment on function public.dp_qb_create_practice_session(
  uuid, jsonb, text, text, text, jsonb
) is
  'Atomically validates and creates a fixed practice queue, materializing items and eligibility once so large sessions do not repeatedly execute candidate resolution.';

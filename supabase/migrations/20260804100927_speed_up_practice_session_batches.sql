-- Reduce round trips for very large fixed queues while preserving bounded,
-- idempotent commits. Production's first 23,338-question build required 59
-- 400-row calls; the largest completed in 5.1 seconds. A production rollback
-- benchmark completed a real 1,000-item batch in 1.7 seconds, comfortably
-- inside the function's 30-second timeout without returning to a single
-- database-heavy transaction.
set lock_timeout = '10s';
set statement_timeout = '180s';

create or replace function public.dp_qb_append_practice_session_batch(
  p_user_id uuid,
  p_session_id uuid,
  p_configuration_hash text,
  p_start_position integer,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  build_row public.dp_qb_practice_session_builds%rowtype;
  session_row public.dp_qb_practice_sessions%rowtype;
  item_count integer;
  next_count integer;
begin
  if p_user_id is null or p_session_id is null then
    raise exception 'Practice session user and session ID are required'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Practice session items must be an array' using errcode = '22023';
  end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 1000 then
    raise exception 'Practice session batch must contain between 1 and 1000 items'
      using errcode = '22023';
  end if;

  select * into strict build_row
  from public.dp_qb_practice_session_builds build
  where build.session_id = p_session_id
    and build.user_id = p_user_id
  for update;
  select * into strict session_row
  from public.dp_qb_practice_sessions session
  where session.id = p_session_id
    and session.user_id = p_user_id;

  if build_row.configuration_hash <> p_configuration_hash
     or session_row.configuration_hash <> p_configuration_hash then
    raise exception 'Practice session configuration changed during generation'
      using errcode = '23514';
  end if;

  drop table if exists pg_temp.dp_qb_session_batch_stage;
  create temporary table pg_temp.dp_qb_session_batch_stage (
    item_position integer not null,
    primary_block_key text not null,
    primary_block_snapshot jsonb not null,
    question_id uuid not null,
    variant_id uuid not null,
    matches jsonb not null
  ) on commit drop;

  insert into pg_temp.dp_qb_session_batch_stage (
    item_position, primary_block_key, primary_block_snapshot,
    question_id, variant_id, matches
  )
  select
    (item.value ->> 'position')::integer,
    item.value ->> 'primaryBlockKey',
    coalesce(item.value -> 'primaryBlockSnapshot', '{}'::jsonb),
    (item.value ->> 'questionId')::uuid,
    (item.value ->> 'variantId')::uuid,
    item.value -> 'matches'
  from jsonb_array_elements(p_items) item(value);

  if (select count(*) from pg_temp.dp_qb_session_batch_stage) <> item_count
     or (select min(item_position) from pg_temp.dp_qb_session_batch_stage)
          <> p_start_position
     or (select max(item_position) from pg_temp.dp_qb_session_batch_stage)
          <> p_start_position + item_count - 1
     or exists (
       select 1 from pg_temp.dp_qb_session_batch_stage
       group by item_position having count(*) > 1
     )
     or exists (
       select 1 from pg_temp.dp_qb_session_batch_stage
       group by question_id having count(*) > 1
     ) then
    raise exception 'Practice session batch positions and questions are invalid'
      using errcode = '23505';
  end if;
  if exists (
    select 1
    from pg_temp.dp_qb_session_batch_stage item
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

  if p_start_position < build_row.processed_count then
    if p_start_position + item_count > build_row.processed_count
       or exists (
         select 1
         from pg_temp.dp_qb_session_batch_stage staged
         left join public.dp_qb_practice_session_items existing
           on existing.session_id = p_session_id
          and existing.position = staged.item_position
          and existing.question_id = staged.question_id
          and existing.variant_id = staged.variant_id
         where existing.id is null
       ) then
      raise exception 'Practice session batch does not match committed progress'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'sessionId', build_row.session_id,
      'generationSeed', session_row.generation_seed,
      'processedCount', build_row.processed_count,
      'totalCount', build_row.total_count,
      'status', build_row.status
    );
  end if;

  if p_start_position <> build_row.processed_count
     or p_start_position + item_count > build_row.total_count then
    raise exception 'Practice session batch is out of sequence'
      using errcode = '23514';
  end if;

  insert into public.dp_qb_practice_session_items (
    session_id, position, primary_block_id, primary_block_snapshot,
    question_id, variant_id, status
  )
  select
    p_session_id, item.item_position, null, item.primary_block_snapshot,
    item.question_id, item.variant_id, 'queued'
  from pg_temp.dp_qb_session_batch_stage item
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
  from pg_temp.dp_qb_session_batch_stage item
  join public.dp_qb_practice_session_items session_item
    on session_item.session_id = p_session_id
   and session_item.position = item.item_position
  cross join lateral jsonb_array_elements(item.matches) matched(value);

  next_count := build_row.processed_count + item_count;
  update public.dp_qb_practice_session_builds
  set processed_count = next_count,
      status = case when next_count = total_count then 'complete' else 'building' end,
      completed_at = case when next_count = total_count then now() else null end,
      updated_at = now()
  where session_id = p_session_id
  returning * into build_row;

  if build_row.status = 'complete' then
    update public.dp_qb_practice_sessions
    set generated_count = build_row.total_count,
        status = 'generated',
        updated_at = now()
    where id = p_session_id;
  end if;

  return jsonb_build_object(
    'sessionId', build_row.session_id,
    'generationSeed', session_row.generation_seed,
    'processedCount', build_row.processed_count,
    'totalCount', build_row.total_count,
    'status', build_row.status
  );
end;
$$;

revoke all on function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) to service_role;

alter function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) set statement_timeout = '30s';

comment on function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) is 'Appends one idempotent bounded batch of up to 1,000 items and exposes committed processed/total progress.';

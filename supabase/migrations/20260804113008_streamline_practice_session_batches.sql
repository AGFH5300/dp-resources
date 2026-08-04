-- Avoid writing every batch to a temporary staging table before writing the
-- durable queue. Typed JSON recordsets retain all validation while removing
-- that duplicate 10,000-row write.

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
  parsed_count integer;
  unique_position_count integer;
  unique_question_count integer;
  minimum_position integer;
  maximum_position integer;
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
  if item_count < 1 or item_count > 10000 then
    raise exception 'Practice session batch must contain between 1 and 10000 items'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) item(value)
    where jsonb_typeof(item.value) <> 'object'
       or jsonb_typeof(item.value -> 'matchedBlockKeys') <> 'array'
  ) then
    raise exception 'Practice session batch contains an invalid item'
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

  select
    count(*)::integer,
    count(distinct item."position")::integer,
    count(distinct item."questionId")::integer,
    min(item."position"),
    max(item."position")
  into
    parsed_count,
    unique_position_count,
    unique_question_count,
    minimum_position,
    maximum_position
  from jsonb_to_recordset(p_items) as item(
    "position" integer,
    "primaryBlockKey" text,
    "questionId" uuid,
    "variantId" uuid,
    "matchedBlockKeys" jsonb
  );

  if parsed_count <> item_count
     or unique_position_count <> item_count
     or unique_question_count <> item_count
     or minimum_position <> p_start_position
     or maximum_position <> p_start_position + item_count - 1 then
    raise exception 'Practice session batch positions and questions are invalid'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      "position" integer,
      "primaryBlockKey" text,
      "questionId" uuid,
      "variantId" uuid,
      "matchedBlockKeys" jsonb
    )
    where char_length(coalesce(item."primaryBlockKey", '')) not between 1 and 100
       or jsonb_array_length(item."matchedBlockKeys") < 1
       or not exists (
         select 1
         from jsonb_array_elements_text(item."matchedBlockKeys") matched(block_key)
         where matched.block_key = item."primaryBlockKey"
       )
       or exists (
         select 1
         from jsonb_array_elements_text(item."matchedBlockKeys") matched(block_key)
         where not exists (
           select 1
           from jsonb_array_elements(session_row.configuration_snapshot -> 'blocks')
             block(value)
           where block.value ->> 'key' = matched.block_key
         )
       )
       or (
         select count(*)
         from jsonb_array_elements_text(item."matchedBlockKeys") matched(block_key)
       ) <> (
         select count(distinct matched.block_key)
         from jsonb_array_elements_text(item."matchedBlockKeys") matched(block_key)
       )
  ) then
    raise exception 'Every practice item needs valid block matches'
      using errcode = '23514';
  end if;

  if p_start_position < build_row.processed_count then
    if p_start_position + item_count > build_row.processed_count
       or exists (
         select 1
         from jsonb_to_recordset(p_items) as staged(
           "position" integer,
           "questionId" uuid,
           "variantId" uuid
         )
         left join public.dp_qb_practice_session_items existing
           on existing.session_id = p_session_id
          and existing.position = staged."position"
          and existing.question_id = staged."questionId"
          and existing.variant_id = staged."variantId"
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
    session_id,
    position,
    primary_block_id,
    primary_block_snapshot,
    primary_block_key,
    match_keys,
    question_id,
    variant_id,
    status
  )
  select
    p_session_id,
    item."position",
    null,
    jsonb_build_object('key', item."primaryBlockKey"),
    item."primaryBlockKey",
    array(
      select jsonb_array_elements_text(item."matchedBlockKeys")
    ),
    item."questionId",
    item."variantId",
    'queued'
  from jsonb_to_recordset(p_items) as item(
    "position" integer,
    "primaryBlockKey" text,
    "questionId" uuid,
    "variantId" uuid,
    "matchedBlockKeys" jsonb
  )
  order by item."position";

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
) is 'Appends one idempotent typed-JSON batch of up to 10,000 compact queue items without a duplicate staging write.';

-- Ordinary Question Bank practice sessions are stored in the member's browser.
-- Only an explicitly named/shared exact queue is copied into durable Postgres
-- storage. These service-role-only functions validate chunk uploads and keep an
-- incomplete share invisible as a configuration-only share until finalization.

set lock_timeout = '10s';
set statement_timeout = '180s';

create or replace function public.dp_qb_append_local_practice_share_chunk(
  p_user_id uuid,
  p_code text,
  p_start_position integer,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  formatted_code text;
  share_row public.dp_qb_practice_shares%rowtype;
  item_count integer;
  parsed_count integer;
  unique_position_count integer;
  unique_question_count integer;
  minimum_position integer;
  maximum_position integer;
  question_ids uuid[];
  committed_count integer;
begin
  if p_user_id is null then
    raise exception 'Practice share user is required' using errcode = '22023';
  end if;
  if char_length(normalized_code) = 8 then
    formatted_code := substr(normalized_code, 1, 4) || '-' || substr(normalized_code, 5, 4);
  else
    formatted_code := upper(btrim(coalesce(p_code, '')));
  end if;
  if p_start_position is null or p_start_position < 0 then
    raise exception 'Practice share chunk position is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Practice share chunk must be an array' using errcode = '22023';
  end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 10000 then
    raise exception 'Practice share chunk must contain between 1 and 10000 items'
      using errcode = '22023';
  end if;

  select * into share_row
  from public.dp_qb_practice_shares share
  where share.code = formatted_code
    and share.owner_id = p_user_id
  for update;
  if not found then
    raise exception 'Practice share was not found' using errcode = 'P0002';
  end if;
  if share_row.has_exact_queue then
    raise exception 'This practice share is already finalized' using errcode = '23514';
  end if;

  select
    count(*)::integer,
    count(distinct item."position")::integer,
    count(distinct item."questionId")::integer,
    min(item."position"),
    max(item."position"),
    array_agg(item."questionId" order by item."position")
  into
    parsed_count,
    unique_position_count,
    unique_question_count,
    minimum_position,
    maximum_position,
    question_ids
  from jsonb_to_recordset(p_items) as item(
    "position" integer,
    "questionId" uuid,
    "variantId" uuid,
    "primaryBlockKey" text,
    "matchedBlockKeys" jsonb
  );

  if parsed_count <> item_count
     or unique_position_count <> item_count
     or unique_question_count <> item_count
     or minimum_position <> p_start_position
     or maximum_position <> p_start_position + item_count - 1 then
    raise exception 'Practice share chunk positions or questions are invalid'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      "position" integer,
      "questionId" uuid,
      "variantId" uuid,
      "primaryBlockKey" text,
      "matchedBlockKeys" jsonb
    )
    left join public.dp_qb_question_variants variant
      on variant.id = item."variantId"
     and variant.question_id = item."questionId"
     and variant.render_status = 'ready'
    where variant.id is null
       or char_length(coalesce(item."primaryBlockKey", '')) not between 1 and 100
       or jsonb_typeof(item."matchedBlockKeys") <> 'array'
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
           from jsonb_array_elements(share_row.configuration_snapshot -> 'blocks')
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
    raise exception 'Practice share chunk contains an invalid question or block match'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.dp_qb_practice_share_queue_chunks chunk
    where chunk.share_id = share_row.id
      and chunk.start_position = p_start_position
  ) then
    if exists (
      select 1
      from public.dp_qb_practice_share_queue_chunks chunk
      where chunk.share_id = share_row.id
        and chunk.start_position = p_start_position
        and chunk.item_count = item_count
        and chunk.items = p_items
    ) then
      select coalesce(sum(chunk.item_count), 0)::integer into committed_count
      from public.dp_qb_practice_share_queue_chunks chunk
      where chunk.share_id = share_row.id;
      return committed_count;
    end if;
    raise exception 'Practice share chunk conflicts with an existing upload'
      using errcode = '23505';
  end if;

  select coalesce(sum(chunk.item_count), 0)::integer into committed_count
  from public.dp_qb_practice_share_queue_chunks chunk
  where chunk.share_id = share_row.id;
  if committed_count <> p_start_position then
    raise exception 'Practice share chunks must be uploaded in order'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.dp_qb_practice_share_queue_chunks chunk
    where chunk.share_id = share_row.id
      and chunk.question_ids && question_ids
  ) then
    raise exception 'Practice share queue contains a duplicate question'
      using errcode = '23505';
  end if;

  insert into public.dp_qb_practice_share_queue_chunks (
    share_id,
    start_position,
    item_count,
    question_ids,
    items
  ) values (
    share_row.id,
    p_start_position,
    item_count,
    question_ids,
    p_items
  );

  return committed_count + item_count;
end;
$$;

create or replace function public.dp_qb_finalize_local_practice_share_queue(
  p_user_id uuid,
  p_code text,
  p_expected_count integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  formatted_code text;
  share_row public.dp_qb_practice_shares%rowtype;
  stored_count integer;
begin
  if p_expected_count is null or p_expected_count < 1 then
    raise exception 'Practice share question count is invalid' using errcode = '22023';
  end if;
  if char_length(normalized_code) = 8 then
    formatted_code := substr(normalized_code, 1, 4) || '-' || substr(normalized_code, 5, 4);
  else
    formatted_code := upper(btrim(coalesce(p_code, '')));
  end if;

  select * into share_row
  from public.dp_qb_practice_shares share
  where share.code = formatted_code
    and share.owner_id = p_user_id
  for update;
  if not found then
    raise exception 'Practice share was not found' using errcode = 'P0002';
  end if;
  if share_row.has_exact_queue then
    if share_row.exact_question_count = p_expected_count then
      return share_row.exact_question_count;
    end if;
    raise exception 'This practice share is already finalized with a different count'
      using errcode = '23514';
  end if;

  select coalesce(sum(chunk.item_count), 0)::integer into stored_count
  from public.dp_qb_practice_share_queue_chunks chunk
  where chunk.share_id = share_row.id;
  if stored_count <> p_expected_count then
    raise exception 'The uploaded practice share queue is incomplete'
      using errcode = '23514';
  end if;
  if exists (
    with ordered as (
      select
        chunk.start_position,
        coalesce(
          sum(chunk.item_count) over (
            order by chunk.start_position
            rows between unbounded preceding and 1 preceding
          ),
          0
        )::integer as expected_start
      from public.dp_qb_practice_share_queue_chunks chunk
      where chunk.share_id = share_row.id
    )
    select 1 from ordered where start_position <> expected_start
  ) then
    raise exception 'The uploaded practice share queue has a gap'
      using errcode = '23514';
  end if;

  update public.dp_qb_practice_shares
  set has_exact_queue = true,
      exact_question_count = stored_count
  where id = share_row.id;
  return stored_count;
end;
$$;

create or replace function public.dp_qb_cancel_local_practice_share(
  p_user_id uuid,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  formatted_code text;
  deleted_count integer;
begin
  if char_length(normalized_code) = 8 then
    formatted_code := substr(normalized_code, 1, 4) || '-' || substr(normalized_code, 5, 4);
  else
    formatted_code := upper(btrim(coalesce(p_code, '')));
  end if;
  delete from public.dp_qb_practice_shares share
  where share.code = formatted_code
    and share.owner_id = p_user_id
    and not share.has_exact_queue;
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.dp_qb_append_local_practice_share_chunk(
  uuid, text, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.dp_qb_finalize_local_practice_share_queue(
  uuid, text, integer
) from public, anon, authenticated;
revoke all on function public.dp_qb_cancel_local_practice_share(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.dp_qb_append_local_practice_share_chunk(
  uuid, text, integer, jsonb
) to service_role;
grant execute on function public.dp_qb_finalize_local_practice_share_queue(
  uuid, text, integer
) to service_role;
grant execute on function public.dp_qb_cancel_local_practice_share(
  uuid, text
) to service_role;

comment on function public.dp_qb_append_local_practice_share_chunk(
  uuid, text, integer, jsonb
) is 'Uploads one validated, ordered chunk from a browser-local practice queue into its owner''s not-yet-finalized share.';
comment on function public.dp_qb_finalize_local_practice_share_queue(
  uuid, text, integer
) is 'Makes an explicitly shared browser-local exact queue durable after validating its complete contiguous upload.';
comment on function public.dp_qb_cancel_local_practice_share(
  uuid, text
) is 'Deletes only the owner''s incomplete exact-share upload after client failure or cancellation.';

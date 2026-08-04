-- Store immutable large practice queues in a few JSONB chunks instead of
-- synchronously inserting tens of thousands of heavily indexed item rows.
-- Existing row-backed sessions remain fully supported.

set lock_timeout = '10s';
set statement_timeout = '180s';

alter table public.dp_qb_practice_sessions
  add column queue_storage text not null default 'rows';
alter table public.dp_qb_practice_sessions
  add constraint dp_qb_practice_sessions_queue_storage_check
  check (queue_storage in ('rows', 'chunks'));

create table public.dp_qb_practice_session_queue_chunks (
  session_id uuid not null
    references public.dp_qb_practice_sessions(id) on delete cascade,
  start_position integer not null check (start_position >= 0),
  item_count integer not null check (item_count between 1 and 10000),
  question_ids uuid[] not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  primary key (session_id, start_position),
  check (jsonb_array_length(items) = item_count),
  check (cardinality(question_ids) = item_count)
);

create table public.dp_qb_practice_share_queue_chunks (
  share_id uuid not null
    references public.dp_qb_practice_shares(id) on delete cascade,
  start_position integer not null check (start_position >= 0),
  item_count integer not null check (item_count between 1 and 10000),
  question_ids uuid[] not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  primary key (share_id, start_position),
  check (jsonb_array_length(items) = item_count),
  check (cardinality(question_ids) = item_count)
);

alter table public.dp_qb_practice_session_queue_chunks enable row level security;
alter table public.dp_qb_practice_share_queue_chunks enable row level security;
revoke all on table public.dp_qb_practice_session_queue_chunks
  from public, anon, authenticated;
revoke all on table public.dp_qb_practice_share_queue_chunks
  from public, anon, authenticated;
grant all on table public.dp_qb_practice_session_queue_chunks to service_role;
grant all on table public.dp_qb_practice_share_queue_chunks to service_role;

-- Preserve the already-deployed row implementations for old or interrupted
-- sessions, but remove them from the exposed schema and browser roles.
alter function public.dp_qb_begin_practice_session_build(
  uuid, uuid, jsonb, text, text, text, integer
) rename to dp_qb_begin_practice_session_build_rows;
alter function public.dp_qb_begin_practice_session_build_rows(
  uuid, uuid, jsonb, text, text, text, integer
) set schema private;
revoke all on function private.dp_qb_begin_practice_session_build_rows(
  uuid, uuid, jsonb, text, text, text, integer
) from public, anon, authenticated;

alter function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) rename to dp_qb_append_practice_session_batch_rows;
alter function public.dp_qb_append_practice_session_batch_rows(
  uuid, uuid, text, integer, jsonb
) set schema private;
revoke all on function private.dp_qb_append_practice_session_batch_rows(
  uuid, uuid, text, integer, jsonb
) from public, anon, authenticated;

create function public.dp_qb_begin_practice_session_build(
  p_user_id uuid,
  p_client_request_id uuid,
  p_configuration jsonb,
  p_generation_seed text,
  p_configuration_hash text,
  p_ordering_mode text,
  p_total_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  build_state jsonb;
  resolved_session_id uuid;
begin
  build_state := private.dp_qb_begin_practice_session_build_rows(
    p_user_id,
    p_client_request_id,
    p_configuration,
    p_generation_seed,
    p_configuration_hash,
    p_ordering_mode,
    p_total_count
  );
  resolved_session_id := (build_state ->> 'sessionId')::uuid;

  -- A brand-new or still-empty retry can safely adopt chunk storage. A legacy
  -- build that already committed rows keeps its original representation.
  update public.dp_qb_practice_sessions session
  set queue_storage = 'chunks'
  from public.dp_qb_practice_session_builds build
  where session.id = resolved_session_id
    and build.session_id = session.id
    and build.processed_count = 0
    and not exists (
      select 1
      from public.dp_qb_practice_session_items item
      where item.session_id = session.id
    );

  return build_state;
end;
$$;

create function public.dp_qb_append_practice_session_batch(
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
  batch_item_count integer;
  parsed_count integer;
  unique_position_count integer;
  unique_question_count integer;
  minimum_position integer;
  maximum_position integer;
  batch_question_ids uuid[];
  next_count integer;
begin
  select * into strict session_row
  from public.dp_qb_practice_sessions session
  where session.id = p_session_id
    and session.user_id = p_user_id;

  if session_row.queue_storage = 'rows' then
    return private.dp_qb_append_practice_session_batch_rows(
      p_user_id,
      p_session_id,
      p_configuration_hash,
      p_start_position,
      p_items
    );
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Practice session items must be an array' using errcode = '22023';
  end if;
  batch_item_count := jsonb_array_length(p_items);
  if batch_item_count < 1 or batch_item_count > 10000 then
    raise exception 'Practice session batch must contain between 1 and 10000 items'
      using errcode = '22023';
  end if;

  select * into strict build_row
  from public.dp_qb_practice_session_builds build
  where build.session_id = p_session_id
    and build.user_id = p_user_id
  for update;

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
    max(item."position"),
    array_agg(item."questionId" order by item."position")
  into
    parsed_count,
    unique_position_count,
    unique_question_count,
    minimum_position,
    maximum_position,
    batch_question_ids
  from jsonb_to_recordset(p_items) as item(
    "position" integer,
    "primaryBlockKey" text,
    "questionId" uuid,
    "variantId" uuid,
    "matchedBlockKeys" jsonb
  );

  if parsed_count <> batch_item_count
     or unique_position_count <> batch_item_count
     or unique_question_count <> batch_item_count
     or minimum_position <> p_start_position
     or maximum_position <> p_start_position + batch_item_count - 1 then
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
    raise exception 'Practice session batch contains an invalid question or block match'
      using errcode = '23514';
  end if;

  if p_start_position < build_row.processed_count then
    if not exists (
      select 1
      from public.dp_qb_practice_session_queue_chunks chunk
      where chunk.session_id = p_session_id
        and chunk.start_position = p_start_position
        and chunk.item_count = batch_item_count
        and chunk.items = p_items
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
     or p_start_position + batch_item_count > build_row.total_count then
    raise exception 'Practice session batch is out of sequence'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.dp_qb_practice_session_queue_chunks chunk
    where chunk.session_id = p_session_id
      and chunk.question_ids && batch_question_ids
  ) then
    raise exception 'Practice session queue contains a duplicate question'
      using errcode = '23505';
  end if;

  insert into public.dp_qb_practice_session_queue_chunks (
    session_id, start_position, item_count, question_ids, items
  ) values (
    p_session_id, p_start_position, batch_item_count, batch_question_ids, p_items
  );

  next_count := build_row.processed_count + batch_item_count;
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

revoke all on function public.dp_qb_begin_practice_session_build(
  uuid, uuid, jsonb, text, text, text, integer
) from public, anon, authenticated;
revoke all on function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.dp_qb_begin_practice_session_build(
  uuid, uuid, jsonb, text, text, text, integer
) to service_role;
grant execute on function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) to service_role;
alter function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) set statement_timeout = '30s';

-- Return only one requested page from a chunk queue, overlaying sparse item
-- state rows created as the user views or completes questions.
create function public.dp_qb_compact_practice_session_page(
  p_user_id uuid,
  p_session_id uuid,
  p_requested_page integer,
  p_page_size integer,
  p_requested_variant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.dp_qb_practice_sessions%rowtype;
  page_size integer := least(greatest(coalesce(p_page_size, 50), 10), 100);
  page_count integer;
  current_page integer;
  target_position integer;
  page_offset integer;
  last_position integer;
  page_items jsonb;
  previous_variant_id uuid;
  next_variant_id uuid;
begin
  select * into strict session_row
  from public.dp_qb_practice_sessions session
  where session.id = p_session_id
    and session.user_id = p_user_id
    and session.queue_storage = 'chunks';

  page_count := greatest(1, ceil(session_row.generated_count::numeric / page_size)::integer);
  if p_requested_variant_id is not null then
    select item."position" into target_position
    from public.dp_qb_practice_session_queue_chunks chunk
    cross join lateral jsonb_to_recordset(chunk.items) as item(
      "position" integer,
      "variantId" uuid
    )
    where chunk.session_id = p_session_id
      and item."variantId" = p_requested_variant_id
    limit 1;
  end if;

  current_page := least(
    page_count,
    greatest(
      1,
      case
        when target_position is not null then floor(target_position::numeric / page_size)::integer + 1
        when coalesce(p_requested_page, 0) > 0 then p_requested_page
        else floor(session_row.current_position::numeric / page_size)::integer + 1
      end
    )
  );
  page_offset := (current_page - 1) * page_size;
  last_position := least(session_row.generated_count - 1, page_offset + page_size - 1);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', state.id,
        'position', queued."position",
        'status', coalesce(state.status, 'queued'),
        'question_id', queued."questionId",
        'variant_id', queued."variantId",
        'primary_block_snapshot', jsonb_build_object(
          'key', queued."primaryBlockKey"
        )
      ) order by queued."position"
    ),
    '[]'::jsonb
  ) into page_items
  from public.dp_qb_practice_session_queue_chunks chunk
  cross join lateral jsonb_to_recordset(chunk.items) as queued(
    "position" integer,
    "primaryBlockKey" text,
    "questionId" uuid,
    "variantId" uuid
  )
  left join public.dp_qb_practice_session_items state
    on state.session_id = p_session_id
   and state.position = queued."position"
  where chunk.session_id = p_session_id
    and queued."position" between page_offset and last_position;

  if page_offset > 0 then
    select queued."variantId" into previous_variant_id
    from public.dp_qb_practice_session_queue_chunks chunk
    cross join lateral jsonb_to_recordset(chunk.items) as queued(
      "position" integer,
      "variantId" uuid
    )
    where chunk.session_id = p_session_id
      and queued."position" = page_offset - 1
    limit 1;
  end if;
  if last_position + 1 < session_row.generated_count then
    select queued."variantId" into next_variant_id
    from public.dp_qb_practice_session_queue_chunks chunk
    cross join lateral jsonb_to_recordset(chunk.items) as queued(
      "position" integer,
      "variantId" uuid
    )
    where chunk.session_id = p_session_id
      and queued."position" = last_position + 1
    limit 1;
  end if;

  return jsonb_build_object(
    'currentPage', current_page,
    'pages', page_count,
    'pageSize', page_size,
    'offset', page_offset,
    'previousBoundaryVariantId', previous_variant_id,
    'nextBoundaryVariantId', next_variant_id,
    'items', page_items
  );
end;
$$;

create function public.dp_qb_update_compact_practice_session_item(
  p_user_id uuid,
  p_session_id uuid,
  p_variant_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.dp_qb_practice_sessions%rowtype;
  queued_item record;
  state_item public.dp_qb_practice_session_items%rowtype;
  next_status text;
  now_at timestamptz := now();
  completed_count integer;
begin
  if p_status not in ('viewed', 'completed', 'skipped') then
    raise exception 'Invalid practice session item status' using errcode = '22023';
  end if;
  select * into session_row
  from public.dp_qb_practice_sessions session
  where session.id = p_session_id
    and session.user_id = p_user_id
    and session.queue_storage = 'chunks'
  for update;
  if not found then return false; end if;

  select
    queued."position" as position,
    queued."primaryBlockKey" as primary_block_key,
    queued."questionId" as question_id,
    queued."variantId" as variant_id,
    array(
      select jsonb_array_elements_text(queued."matchedBlockKeys")
    ) as match_keys
  into queued_item
  from public.dp_qb_practice_session_queue_chunks chunk
  cross join lateral jsonb_to_recordset(chunk.items) as queued(
    "position" integer,
    "primaryBlockKey" text,
    "questionId" uuid,
    "variantId" uuid,
    "matchedBlockKeys" jsonb
  )
  where chunk.session_id = p_session_id
    and queued."variantId" = p_variant_id
  limit 1;
  if not found then return false; end if;

  insert into public.dp_qb_practice_session_items (
    session_id, position, primary_block_id, primary_block_snapshot,
    primary_block_key, match_keys, question_id, variant_id, status
  ) values (
    p_session_id, queued_item.position, null,
    jsonb_build_object('key', queued_item.primary_block_key),
    queued_item.primary_block_key, queued_item.match_keys,
    queued_item.question_id, queued_item.variant_id, 'queued'
  ) on conflict (session_id, position) do nothing;

  select * into strict state_item
  from public.dp_qb_practice_session_items item
  where item.session_id = p_session_id
    and item.position = queued_item.position
  for update;

  next_status := case
    when state_item.status = 'completed' then 'completed'
    when p_status = 'completed' then 'completed'
    when p_status = 'skipped' then 'skipped'
    when state_item.status = 'skipped' then 'skipped'
    else 'viewed'
  end;
  update public.dp_qb_practice_session_items
  set status = next_status,
      first_viewed_at = coalesce(first_viewed_at, now_at),
      completed_at = case
        when next_status = 'completed' then coalesce(completed_at, now_at)
        else completed_at
      end,
      updated_at = now_at
  where id = state_item.id;

  select count(*)::integer into completed_count
  from public.dp_qb_practice_session_items item
  where item.session_id = p_session_id
    and item.status = 'completed';
  update public.dp_qb_practice_sessions
  set current_position = queued_item.position,
      status = case
        when completed_count = generated_count then 'completed'
        else 'in_progress'
      end,
      started_at = coalesce(started_at, now_at),
      completed_at = case
        when completed_count = generated_count then now_at
        else null
      end,
      updated_at = now_at
  where id = p_session_id;
  return true;
end;
$$;

revoke all on function public.dp_qb_compact_practice_session_page(
  uuid, uuid, integer, integer, uuid
) from public, anon, authenticated;
revoke all on function public.dp_qb_update_compact_practice_session_item(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.dp_qb_compact_practice_session_page(
  uuid, uuid, integer, integer, uuid
) to service_role;
grant execute on function public.dp_qb_update_compact_practice_session_item(
  uuid, uuid, uuid, text
) to service_role;

-- Keep exact-session sharing compact as well. Configuration-only and legacy
-- row-backed shares delegate to the already-deployed implementations.
alter function public.dp_qb_create_practice_share(
  uuid, text, jsonb, uuid
) rename to dp_qb_create_practice_share_rows;
alter function public.dp_qb_create_practice_share_rows(
  uuid, text, jsonb, uuid
) set schema private;
revoke all on function private.dp_qb_create_practice_share_rows(
  uuid, text, jsonb, uuid
) from public, anon, authenticated;

create function public.dp_qb_create_practice_share(
  p_user_id uuid,
  p_name text,
  p_configuration jsonb,
  p_session_id uuid default null
)
returns table (
  share_code text,
  has_exact_queue boolean,
  exact_question_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.dp_qb_practice_sessions%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
  resolved_username text;
  resolved_display_name text;
  new_share_id uuid;
  new_code text;
  copied_count integer;
begin
  if p_session_id is null then
    return query select * from private.dp_qb_create_practice_share_rows(
      p_user_id, p_name, p_configuration, null
    );
    return;
  end if;
  select * into session_row
  from public.dp_qb_practice_sessions session
  where session.id = p_session_id
    and session.user_id = p_user_id;
  if not found or session_row.queue_storage = 'rows' then
    return query select * from private.dp_qb_create_practice_share_rows(
      p_user_id, p_name, p_configuration, p_session_id
    );
    return;
  end if;
  if char_length(normalized_name) < 3 or char_length(normalized_name) > 120 then
    raise exception 'Practice share name must be between 3 and 120 characters'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dp_resource_memberships membership
    where membership.id = p_user_id
      and membership.is_approved
      and not membership.is_suspended
  ) then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  select
    coalesce(nullif(btrim(profile.username), ''), 'member-' || left(p_user_id::text, 8)),
    nullif(btrim(profile.full_name), '')
  into resolved_username, resolved_display_name
  from public.dp_resource_profiles profile
  where profile.id = p_user_id;
  resolved_username := coalesce(resolved_username, 'member-' || left(p_user_id::text, 8));
  new_code := private.dp_qb_generate_practice_share_code();
  insert into public.dp_qb_practice_shares (
    code, owner_id, name, creator_username, creator_display_name,
    configuration_snapshot, has_exact_queue, exact_question_count
  ) values (
    new_code, p_user_id, normalized_name, resolved_username,
    resolved_display_name, session_row.configuration_snapshot,
    true, session_row.generated_count
  ) returning id into new_share_id;

  insert into public.dp_qb_practice_share_queue_chunks (
    share_id, start_position, item_count, question_ids, items
  )
  select new_share_id, chunk.start_position, chunk.item_count,
    chunk.question_ids, chunk.items
  from public.dp_qb_practice_session_queue_chunks chunk
  where chunk.session_id = p_session_id
  order by chunk.start_position;
  select coalesce(sum(chunk.item_count), 0)::integer into copied_count
  from public.dp_qb_practice_share_queue_chunks chunk
  where chunk.share_id = new_share_id;
  if copied_count <> session_row.generated_count then
    raise exception 'The compact practice queue is incomplete' using errcode = '23514';
  end if;
  return query select new_code, true, copied_count;
end;
$$;

alter function public.dp_qb_clone_practice_share_exact_queue(
  uuid, text
) rename to dp_qb_clone_practice_share_exact_queue_rows;
alter function public.dp_qb_clone_practice_share_exact_queue_rows(
  uuid, text
) set schema private;
revoke all on function private.dp_qb_clone_practice_share_exact_queue_rows(
  uuid, text
) from public, anon, authenticated;

create function public.dp_qb_clone_practice_share_exact_queue(
  p_user_id uuid,
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  formatted_code text;
  source_share public.dp_qb_practice_shares%rowtype;
  new_session_id uuid;
begin
  if char_length(normalized_code) = 8 then
    formatted_code := substr(normalized_code, 1, 4) || '-' || substr(normalized_code, 5, 4);
  else
    formatted_code := upper(btrim(coalesce(p_code, '')));
  end if;
  select * into source_share
  from public.dp_qb_practice_shares share
  where share.code = formatted_code;
  if source_share.id is null or not source_share.has_exact_queue then
    raise exception 'Shared exact question queue was not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.dp_qb_practice_share_queue_chunks chunk
    where chunk.share_id = source_share.id
  ) then
    return private.dp_qb_clone_practice_share_exact_queue_rows(p_user_id, p_code);
  end if;
  if not exists (
    select 1 from public.dp_resource_memberships membership
    where membership.id = p_user_id
      and membership.is_approved
      and not membership.is_suspended
  ) then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  insert into public.dp_qb_practice_sessions (
    user_id, practice_set_id, schema_version, configuration_snapshot,
    generation_seed, configuration_hash, ordering_mode, status,
    requested_count, generated_count, current_position, queue_storage
  ) values (
    p_user_id, null, 1, source_share.configuration_snapshot,
    'shared-' || replace(source_share.code, '-', '') || '-' ||
      encode(extensions.gen_random_bytes(8), 'hex'),
    encode(extensions.digest(source_share.configuration_snapshot::text, 'sha256'), 'hex'),
    coalesce(source_share.configuration_snapshot ->> 'orderingMode', 'interleaved'),
    'generated', source_share.exact_question_count,
    source_share.exact_question_count, 0, 'chunks'
  ) returning id into new_session_id;

  insert into public.dp_qb_practice_session_queue_chunks (
    session_id, start_position, item_count, question_ids, items
  )
  select new_session_id, chunk.start_position, chunk.item_count,
    chunk.question_ids, chunk.items
  from public.dp_qb_practice_share_queue_chunks chunk
  where chunk.share_id = source_share.id
  order by chunk.start_position;
  return new_session_id;
end;
$$;

revoke all on function public.dp_qb_create_practice_share(
  uuid, text, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.dp_qb_clone_practice_share_exact_queue(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.dp_qb_create_practice_share(
  uuid, text, jsonb, uuid
) to service_role;
grant execute on function public.dp_qb_clone_practice_share_exact_queue(
  uuid, text
) to service_role;

comment on table public.dp_qb_practice_session_queue_chunks is
  'Immutable fixed practice queues stored in batches of up to 10,000 items; per-question state remains sparse.';
comment on function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) is 'Validates and stores one idempotent immutable practice queue chunk without expanding it into indexed item rows.';

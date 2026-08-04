-- Make all-subject practice sessions fast without returning to the single
-- database-heavy transaction that previously restarted Postgres. New batches
-- carry only stable IDs/keys, validate variants once per statement, and avoid
-- duplicating immutable configuration JSON into tens of thousands of rows.

set lock_timeout = '10s';
set statement_timeout = '180s';

create temporary table _dp_qb_compact_batch_protected_counts on commit drop as
select
  (select count(*) from public.dp_qb_questions) as questions,
  (select count(*) from public.dp_qb_question_variants) as variants,
  (select count(*) from public.dp_qb_topics) as source_topics,
  (select count(*) from public.dp_qb_subtopics) as subtopics,
  (select count(*) from public.dp_qb_assets) as assets;

alter table public.dp_qb_practice_session_items
  add column primary_block_key text,
  add column match_keys text[] not null default '{}'::text[];

alter table public.dp_qb_practice_session_items
  add constraint dp_qb_practice_session_items_primary_block_key_check
  check (primary_block_key is null or char_length(primary_block_key) between 1 and 100);

-- The original row trigger queried the variants table once for every inserted
-- queue item. A transition-table trigger enforces the identical invariant with
-- one set-based lookup for the complete INSERT or UPDATE statement.
drop trigger if exists dp_qb_practice_session_items_validate
  on public.dp_qb_practice_session_items;
drop trigger if exists dp_qb_practice_session_items_validate_insert
  on public.dp_qb_practice_session_items;
drop trigger if exists dp_qb_practice_session_items_validate_update
  on public.dp_qb_practice_session_items;

create or replace function private.dp_qb_validate_session_item_variants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from new_session_items item
    left join public.dp_qb_question_variants variant
      on variant.id = item.variant_id
     and variant.question_id = item.question_id
     and variant.render_status = 'ready'
    where variant.id is null
  ) then
    raise exception 'Session item variant must be ready and belong to its question'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke all on function private.dp_qb_validate_session_item_variants()
  from public;

create trigger dp_qb_practice_session_items_validate_insert
after insert on public.dp_qb_practice_session_items
referencing new table as new_session_items
for each statement execute function private.dp_qb_validate_session_item_variants();

create trigger dp_qb_practice_session_items_validate_update
after update on public.dp_qb_practice_session_items
referencing new table as new_session_items
for each statement execute function private.dp_qb_validate_session_item_variants();

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

  drop table if exists pg_temp.dp_qb_session_batch_stage;
  drop table if exists pg_temp.dp_qb_session_block_keys;
  create temporary table pg_temp.dp_qb_session_batch_stage (
    item_position integer primary key,
    primary_block_key text not null,
    question_id uuid not null unique,
    variant_id uuid not null,
    match_keys text[] not null
  ) on commit drop;
  create temporary table pg_temp.dp_qb_session_block_keys (
    block_key text primary key
  ) on commit drop;

  insert into pg_temp.dp_qb_session_block_keys (block_key)
  select block.value ->> 'key'
  from jsonb_array_elements(session_row.configuration_snapshot -> 'blocks')
    block(value);

  insert into pg_temp.dp_qb_session_batch_stage (
    item_position,
    primary_block_key,
    question_id,
    variant_id,
    match_keys
  )
  select
    (item.value ->> 'position')::integer,
    item.value ->> 'primaryBlockKey',
    (item.value ->> 'questionId')::uuid,
    (item.value ->> 'variantId')::uuid,
    array(
      select jsonb_array_elements_text(item.value -> 'matchedBlockKeys')
    )
  from jsonb_array_elements(p_items) item(value);

  if (select count(*) from pg_temp.dp_qb_session_batch_stage) <> item_count
     or (select min(item_position) from pg_temp.dp_qb_session_batch_stage)
          <> p_start_position
     or (select max(item_position) from pg_temp.dp_qb_session_batch_stage)
          <> p_start_position + item_count - 1 then
    raise exception 'Practice session batch positions and questions are invalid'
      using errcode = '23505';
  end if;
  if exists (
    select 1
    from pg_temp.dp_qb_session_batch_stage item
    where coalesce(array_length(item.match_keys, 1), 0) < 1
       or not (item.primary_block_key = any(item.match_keys))
       or exists (
         select 1
         from unnest(item.match_keys) matched(block_key)
         left join pg_temp.dp_qb_session_block_keys known using (block_key)
         where known.block_key is null
       )
  ) then
    raise exception 'Every practice item needs valid block matches'
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
    item.item_position,
    null,
    jsonb_build_object('key', item.primary_block_key),
    item.primary_block_key,
    item.match_keys,
    item.question_id,
    item.variant_id,
    'queued'
  from pg_temp.dp_qb_session_batch_stage item
  order by item.item_position;

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

-- The all-subject candidate query previously spilled its sort state to disk.
-- This remains bounded per call and reduced the production-shaped read from
-- about eight seconds to about four seconds without changing its result set.
alter function public.dp_qb_practice_candidates(uuid, jsonb)
  set work_mem = '32MB';
alter function public.dp_qb_practice_candidate_payload(uuid, jsonb)
  set work_mem = '32MB';

-- Exact-session shares still retain complete immutable snapshots. For compact
-- queue rows, rebuild those snapshots from the session configuration; legacy
-- rows continue to read their original item/match records.
create or replace function public.dp_qb_create_practice_share(
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
  normalized_name text := btrim(coalesce(p_name, ''));
  resolved_configuration jsonb;
  resolved_username text;
  resolved_display_name text;
  new_share_id uuid;
  new_code text;
  copied_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'Practice share user is required' using errcode = '22023';
  end if;
  if char_length(normalized_name) < 3 or char_length(normalized_name) > 120 then
    raise exception 'Practice share name must be between 3 and 120 characters'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.dp_resource_memberships membership
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
  resolved_username := coalesce(
    resolved_username,
    'member-' || left(p_user_id::text, 8)
  );

  if p_session_id is not null then
    select session.configuration_snapshot
    into resolved_configuration
    from public.dp_qb_practice_sessions session
    where session.id = p_session_id
      and session.user_id = p_user_id;
    if resolved_configuration is null then
      raise exception 'Practice session was not found' using errcode = 'P0002';
    end if;
  else
    resolved_configuration := p_configuration;
  end if;

  if jsonb_typeof(resolved_configuration) <> 'object'
     or jsonb_typeof(resolved_configuration -> 'blocks') <> 'array'
     or jsonb_array_length(resolved_configuration -> 'blocks') < 1 then
    raise exception 'Invalid practice share configuration' using errcode = '22023';
  end if;

  new_code := private.dp_qb_generate_practice_share_code();
  insert into public.dp_qb_practice_shares (
    code, owner_id, name, creator_username, creator_display_name,
    configuration_snapshot, has_exact_queue, exact_question_count
  ) values (
    new_code, p_user_id, normalized_name, resolved_username,
    resolved_display_name, resolved_configuration, false, 0
  ) returning id into new_share_id;

  if p_session_id is not null then
    insert into public.dp_qb_practice_share_items (
      share_id,
      position,
      question_id,
      variant_id,
      primary_block_snapshot,
      matches_snapshot
    )
    select
      new_share_id,
      item.position,
      item.question_id,
      item.variant_id,
      coalesce(
        (
          select block.value
          from jsonb_array_elements(resolved_configuration -> 'blocks') block(value)
          where block.value ->> 'key' = coalesce(
            item.primary_block_key,
            item.primary_block_snapshot ->> 'key'
          )
          limit 1
        ),
        item.primary_block_snapshot
      ),
      case
        when cardinality(item.match_keys) > 0 then coalesce(
          (
            select jsonb_agg(
              jsonb_strip_nulls(jsonb_build_object(
                'blockKey', block.value ->> 'key',
                'conceptId', block.value ->> 'conceptId',
                'conceptIds', case
                  when block.value ->> 'selectionType' = 'concept' then
                    coalesce(
                      block.value -> 'conceptIds',
                      jsonb_build_array(block.value ->> 'conceptId')
                    )
                  else null
                end,
                'selectionType', block.value ->> 'selectionType'
              ))
              order by matched.ordinality
            )
            from unnest(item.match_keys) with ordinality
              matched(block_key, ordinality)
            join lateral (
              select candidate.value
              from jsonb_array_elements(resolved_configuration -> 'blocks')
                candidate(value)
              where candidate.value ->> 'key' = matched.block_key
              limit 1
            ) block on true
          ),
          '[]'::jsonb
        )
        else coalesce(
          (
            select jsonb_agg(match.match_snapshot order by match.match_key)
            from public.dp_qb_practice_session_item_matches match
            where match.session_item_id = item.id
          ),
          '[]'::jsonb
        )
      end
    from public.dp_qb_practice_session_items item
    where item.session_id = p_session_id
    order by item.position;

    get diagnostics copied_count = row_count;
    if copied_count < 1 then
      raise exception 'The practice session has no questions to share'
        using errcode = '22023';
    end if;
    update public.dp_qb_practice_shares share
    set has_exact_queue = true,
        exact_question_count = copied_count
    where share.id = new_share_id;
  end if;

  return query
  select new_code, p_session_id is not null, copied_count;
end;
$$;

revoke execute on function public.dp_qb_create_practice_share(
  uuid, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.dp_qb_create_practice_share(
  uuid, text, jsonb, uuid
) to service_role;

create or replace function public.dp_qb_clone_practice_share_exact_queue(
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
    from public.dp_resource_memberships membership
    where membership.id = p_user_id
      and membership.is_approved
      and not membership.is_suspended
  ) then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  insert into public.dp_qb_practice_sessions (
    user_id, practice_set_id, schema_version, configuration_snapshot,
    generation_seed, configuration_hash, ordering_mode, status,
    requested_count, generated_count, current_position
  ) values (
    p_user_id, null, 1, source_share.configuration_snapshot,
    'shared-' || replace(source_share.code, '-', '') || '-' ||
      encode(extensions.gen_random_bytes(8), 'hex'),
    encode(
      extensions.digest(source_share.configuration_snapshot::text, 'sha256'),
      'hex'
    ),
    coalesce(source_share.configuration_snapshot ->> 'orderingMode', 'interleaved'),
    'generated', source_share.exact_question_count,
    source_share.exact_question_count, 0
  ) returning id into new_session_id;

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
    new_session_id,
    item.position,
    null,
    jsonb_build_object('key', item.primary_block_snapshot ->> 'key'),
    item.primary_block_snapshot ->> 'key',
    array(
      select matched.value ->> 'blockKey'
      from jsonb_array_elements(item.matches_snapshot) matched(value)
    ),
    item.question_id,
    item.variant_id,
    'queued'
  from public.dp_qb_practice_share_items item
  where item.share_id = source_share.id
  order by item.position;

  return new_session_id;
end;
$$;

revoke execute on function public.dp_qb_clone_practice_share_exact_queue(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.dp_qb_clone_practice_share_exact_queue(
  uuid, text
) to service_role;

comment on function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) is 'Appends one idempotent compact batch of up to 10,000 fixed queue items and exposes committed progress.';

do $$
declare
  before_counts record;
begin
  select * into before_counts from _dp_qb_compact_batch_protected_counts;
  if (select count(*) from public.dp_qb_questions) <> before_counts.questions
     or (select count(*) from public.dp_qb_question_variants) <> before_counts.variants
     or (select count(*) from public.dp_qb_topics) <> before_counts.source_topics
     or (select count(*) from public.dp_qb_subtopics) <> before_counts.subtopics
     or (select count(*) from public.dp_qb_assets) <> before_counts.assets then
    raise exception 'Compact practice batching changed protected Question Bank data';
  end if;
end;
$$;

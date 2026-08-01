-- Permanent Question Bank practice-set sharing and scalable session counts.
-- Share codes do not expire, cannot be disabled, and have no redemption limit.
-- Recipients always receive their own session and progress state.

set lock_timeout = '10s';
set statement_timeout = '300s';

-- Remove the original first-release 200-question database ceilings. The real
-- maximum is the number of eligible unique questions resolved by the candidate
-- engine for the selected configuration.
alter table public.dp_qb_practice_sets
  drop constraint if exists dp_qb_practice_sets_requested_total_check;
alter table public.dp_qb_practice_sets
  add constraint dp_qb_practice_sets_requested_total_check
  check (requested_total is null or requested_total >= 1);

alter table public.dp_qb_practice_set_blocks
  drop constraint if exists dp_qb_practice_set_blocks_requested_question_count_check;
alter table public.dp_qb_practice_set_blocks
  add constraint dp_qb_practice_set_blocks_requested_question_count_check
  check (requested_question_count >= 1);

alter table public.dp_qb_practice_sessions
  drop constraint if exists dp_qb_practice_sessions_requested_count_check;
alter table public.dp_qb_practice_sessions
  add constraint dp_qb_practice_sessions_requested_count_check
  check (requested_count >= 1);

alter table public.dp_qb_practice_sessions
  drop constraint if exists dp_qb_practice_sessions_generated_count_check;
alter table public.dp_qb_practice_sessions
  add constraint dp_qb_practice_sessions_generated_count_check
  check (generated_count >= 0);

create table public.dp_qb_practice_shares (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null
    check (char_length(btrim(name)) between 3 and 120),
  creator_username text not null
    check (char_length(btrim(creator_username)) between 1 and 80),
  creator_display_name text,
  configuration_snapshot jsonb not null
    check (jsonb_typeof(configuration_snapshot) = 'object'),
  has_exact_queue boolean not null default false,
  exact_question_count integer not null default 0
    check (exact_question_count >= 0),
  created_at timestamptz not null default now(),
  check (
    (has_exact_queue and exact_question_count > 0)
    or (not has_exact_queue and exact_question_count = 0)
  )
);

create index dp_qb_practice_shares_owner_created_idx
  on public.dp_qb_practice_shares(owner_id, created_at desc, id);

create table public.dp_qb_practice_share_items (
  share_id uuid not null
    references public.dp_qb_practice_shares(id) on delete cascade,
  position integer not null check (position >= 0),
  question_id uuid not null
    references public.dp_qb_questions(id) on delete restrict,
  variant_id uuid not null
    references public.dp_qb_question_variants(id) on delete restrict,
  primary_block_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(primary_block_snapshot) = 'object'),
  matches_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(matches_snapshot) = 'array'),
  created_at timestamptz not null default now(),
  primary key (share_id, position),
  unique (share_id, question_id)
);

create index dp_qb_practice_share_items_variant_idx
  on public.dp_qb_practice_share_items(variant_id, share_id);

alter table public.dp_qb_practice_shares enable row level security;
alter table public.dp_qb_practice_share_items enable row level security;

create policy dp_qb_practice_shares_owner_read
  on public.dp_qb_practice_shares
  for select to authenticated
  using (
    private.dp_qb_has_access()
    and owner_id = (select auth.uid())
  );

create policy dp_qb_practice_share_items_owner_read
  on public.dp_qb_practice_share_items
  for select to authenticated
  using (
    private.dp_qb_has_access()
    and exists (
      select 1
      from public.dp_qb_practice_shares share
      where share.id = dp_qb_practice_share_items.share_id
        and share.owner_id = (select auth.uid())
    )
  );

revoke all on table public.dp_qb_practice_shares from anon, authenticated;
revoke all on table public.dp_qb_practice_share_items from anon, authenticated;
grant select on table public.dp_qb_practice_shares to authenticated;
grant select on table public.dp_qb_practice_share_items to authenticated;

create or replace function private.dp_qb_generate_practice_share_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  random_bytes bytea;
  index integer;
begin
  loop
    random_bytes := gen_random_bytes(8);
    candidate := '';
    for index in 0..7 loop
      candidate := candidate || substr(
        alphabet,
        (get_byte(random_bytes, index) % char_length(alphabet)) + 1,
        1
      );
      if index = 3 then
        candidate := candidate || '-';
      end if;
    end loop;

    exit when not exists (
      select 1 from public.dp_qb_practice_shares share where share.code = candidate
    );
  end loop;

  return candidate;
end;
$$;

revoke all on function private.dp_qb_generate_practice_share_code() from public;

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
    code,
    owner_id,
    name,
    creator_username,
    creator_display_name,
    configuration_snapshot,
    has_exact_queue,
    exact_question_count
  ) values (
    new_code,
    p_user_id,
    normalized_name,
    resolved_username,
    resolved_display_name,
    resolved_configuration,
    false,
    0
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
      item.primary_block_snapshot,
      coalesce(
        (
          select jsonb_agg(match.match_snapshot order by match.match_key)
          from public.dp_qb_practice_session_item_matches match
          where match.session_item_id = item.id
        ),
        '[]'::jsonb
      )
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

revoke execute on function public.dp_qb_create_practice_share(uuid, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.dp_qb_create_practice_share(uuid, text, jsonb, uuid)
  to service_role;

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
    source_share.configuration_snapshot,
    'shared-' || replace(source_share.code, '-', '') || '-' || encode(gen_random_bytes(8), 'hex'),
    encode(digest(source_share.configuration_snapshot::text, 'sha256'), 'hex'),
    coalesce(source_share.configuration_snapshot ->> 'orderingMode', 'interleaved'),
    'generated',
    source_share.exact_question_count,
    source_share.exact_question_count,
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
    item.position,
    null,
    item.primary_block_snapshot,
    item.question_id,
    item.variant_id,
    'queued'
  from public.dp_qb_practice_share_items item
  where item.share_id = source_share.id
  order by item.position;

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
    coalesce(match.value ->> 'blockKey', 'shared-' || match.ordinality::text),
    null,
    nullif(match.value ->> 'conceptId', '')::uuid,
    match.value,
    match.value ->> 'blockKey' = share_item.primary_block_snapshot ->> 'key'
  from public.dp_qb_practice_share_items share_item
  join public.dp_qb_practice_session_items session_item
    on session_item.session_id = new_session_id
   and session_item.position = share_item.position
  cross join lateral jsonb_array_elements(share_item.matches_snapshot)
    with ordinality as match(value, ordinality)
  where share_item.share_id = source_share.id;

  return new_session_id;
end;
$$;

revoke execute on function public.dp_qb_clone_practice_share_exact_queue(uuid, text)
  from public, anon, authenticated;
grant execute on function public.dp_qb_clone_practice_share_exact_queue(uuid, text)
  to service_role;

-- Recreate the session persistence function without the first-release 200-item
-- guard. It still requires a contiguous queue, exact requested count, unique
-- question cores, valid candidates, and a primary match for every item.
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

  if exists (
    select 1
    from (
      select
        (item.value ->> 'position')::integer as position,
        item.value ->> 'questionId' as question_id
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
    (item.value ->> 'position')::integer,
    null,
    coalesce(item.value -> 'primaryBlockSnapshot', '{}'::jsonb),
    (item.value ->> 'questionId')::uuid,
    (item.value ->> 'variantId')::uuid,
    'queued'
  from jsonb_array_elements(p_items) item(value)
  order by (item.value ->> 'position')::integer;

  insert into public.dp_qb_practice_session_item_matches (
    session_item_id, match_key, block_id, concept_id, match_snapshot, is_primary
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

revoke execute on function public.dp_qb_create_practice_session(uuid, jsonb, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.dp_qb_create_practice_session(uuid, jsonb, text, text, text, jsonb)
  to service_role;

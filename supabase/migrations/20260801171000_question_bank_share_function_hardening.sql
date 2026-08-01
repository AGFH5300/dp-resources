-- Supabase installs pgcrypto in the extensions schema. Security-definer
-- functions deliberately use an empty search_path, so crypto calls must be
-- schema-qualified rather than relying on the caller's search path.

set lock_timeout = '10s';
set statement_timeout = '300s';

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
    random_bytes := extensions.gen_random_bytes(8);
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
      select 1
      from public.dp_qb_practice_shares share
      where share.code = candidate
    );
  end loop;

  return candidate;
end;
$$;

revoke all on function private.dp_qb_generate_practice_share_code() from public;

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
    'shared-' || replace(source_share.code, '-', '') || '-' ||
      encode(extensions.gen_random_bytes(8), 'hex'),
    encode(
      extensions.digest(source_share.configuration_snapshot::text, 'sha256'),
      'hex'
    ),
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
    coalesce(matched.value ->> 'blockKey', 'shared-' || matched.ordinality::text),
    null,
    nullif(matched.value ->> 'conceptId', '')::uuid,
    matched.value,
    matched.value ->> 'blockKey' = share_item.primary_block_snapshot ->> 'key'
  from public.dp_qb_practice_share_items share_item
  join public.dp_qb_practice_session_items session_item
    on session_item.session_id = new_session_id
   and session_item.position = share_item.position
  cross join lateral jsonb_array_elements(share_item.matches_snapshot)
    with ordinality as matched(value, ordinality)
  where share_item.share_id = source_share.id;

  return new_session_id;
end;
$$;

revoke execute on function public.dp_qb_clone_practice_share_exact_queue(uuid, text)
  from public, anon, authenticated;
grant execute on function public.dp_qb_clone_practice_share_exact_queue(uuid, text)
  to service_role;

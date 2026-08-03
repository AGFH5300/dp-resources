-- Keep very large practice-session writes below the database's peak-memory and
-- request-duration limits, and permanently remove the three retired subjects.

set lock_timeout = '10s';
set statement_timeout = '180s';

alter table public.dp_qb_practice_sessions
  drop constraint if exists dp_qb_practice_sessions_status_check;
alter table public.dp_qb_practice_sessions
  add constraint dp_qb_practice_sessions_status_check
  check (status in ('building', 'generated', 'in_progress', 'completed', 'abandoned'));

create table public.dp_qb_practice_session_builds (
  session_id uuid primary key
    references public.dp_qb_practice_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  configuration_hash text not null
    check (configuration_hash ~ '^[0-9a-f]{64}$'),
  total_count integer not null check (total_count >= 1),
  processed_count integer not null default 0 check (processed_count >= 0),
  status text not null default 'building'
    check (status in ('building', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, client_request_id),
  check (processed_count <= total_count),
  check ((status = 'complete') = (processed_count = total_count))
);

create index dp_qb_practice_session_builds_user_status_idx
  on public.dp_qb_practice_session_builds(user_id, status, updated_at desc);

alter table public.dp_qb_practice_session_builds enable row level security;
revoke all on table public.dp_qb_practice_session_builds
  from public, anon, authenticated;
grant all on table public.dp_qb_practice_session_builds to service_role;

create or replace function public.dp_qb_begin_practice_session_build(
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
  existing_build public.dp_qb_practice_session_builds%rowtype;
  existing_session public.dp_qb_practice_sessions%rowtype;
  new_session_id uuid;
  requested_count bigint;
begin
  if p_user_id is null or p_client_request_id is null then
    raise exception 'Practice session user and request ID are required'
      using errcode = '22023';
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
  if p_total_count is null or p_total_count < 1 then
    raise exception 'Practice session needs at least one question'
      using errcode = '22023';
  end if;

  select coalesce(sum((block.value ->> 'requestedCount')::bigint), 0)
  into requested_count
  from jsonb_array_elements(p_configuration -> 'blocks') block(value);
  if requested_count <> p_total_count::bigint then
    raise exception 'Generated practice item count does not match the request'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_client_request_id::text, 0)
  );

  select * into existing_build
  from public.dp_qb_practice_session_builds build
  where build.user_id = p_user_id
    and build.client_request_id = p_client_request_id;

  if found then
    if existing_build.configuration_hash <> p_configuration_hash
       or existing_build.total_count <> p_total_count then
      raise exception 'Practice build request ID was reused for another configuration'
        using errcode = '23505';
    end if;
    select * into strict existing_session
    from public.dp_qb_practice_sessions session
    where session.id = existing_build.session_id
      and session.user_id = p_user_id;
    return jsonb_build_object(
      'sessionId', existing_build.session_id,
      'generationSeed', existing_session.generation_seed,
      'processedCount', existing_build.processed_count,
      'totalCount', existing_build.total_count,
      'status', existing_build.status
    );
  end if;

  insert into public.dp_qb_practice_sessions (
    user_id, practice_set_id, schema_version, configuration_snapshot,
    generation_seed, configuration_hash, ordering_mode, status,
    requested_count, generated_count, current_position
  ) values (
    p_user_id, null, 1, p_configuration,
    p_generation_seed, p_configuration_hash, p_ordering_mode, 'building',
    p_total_count, 0, 0
  ) returning id into new_session_id;

  insert into public.dp_qb_practice_session_builds (
    session_id, user_id, client_request_id, configuration_hash,
    total_count, processed_count, status
  ) values (
    new_session_id, p_user_id, p_client_request_id, p_configuration_hash,
    p_total_count, 0, 'building'
  );

  return jsonb_build_object(
    'sessionId', new_session_id,
    'generationSeed', p_generation_seed,
    'processedCount', 0,
    'totalCount', p_total_count,
    'status', 'building'
  );
end;
$$;

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
  if item_count < 1 or item_count > 400 then
    raise exception 'Practice session batch must contain between 1 and 400 items'
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

alter function public.dp_qb_begin_practice_session_build(
  uuid, uuid, jsonb, text, text, text, integer
) set statement_timeout = '30s';
alter function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) set statement_timeout = '30s';

comment on function public.dp_qb_begin_practice_session_build(
  uuid, uuid, jsonb, text, text, text, integer
) is 'Creates or resumes one idempotent fixed-queue build without inserting its question rows.';
comment on function public.dp_qb_append_practice_session_batch(
  uuid, uuid, text, integer, jsonb
) is 'Appends one idempotent bounded batch and exposes committed processed/total progress.';

-- A short-lived, service-role-only queue lets the separately authenticated R2
-- cleanup remove the exact now-orphaned objects and verify every 404.
create table public.dp_qb_asset_deletion_queue (
  asset_id uuid primary key,
  storage_provider text not null check (storage_provider = 'r2'),
  storage_bucket text not null,
  storage_key text not null,
  byte_size bigint not null check (byte_size >= 0),
  queued_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_provider, storage_bucket, storage_key)
);
alter table public.dp_qb_asset_deletion_queue enable row level security;
revoke all on table public.dp_qb_asset_deletion_queue
  from public, anon, authenticated;
grant all on table public.dp_qb_asset_deletion_queue to service_role;

create temporary table _dp_qb_removed_subjects on commit drop as
select id
from public.dp_qb_subjects
where id in ('english-b', 'philosophy', 'world-religions');

do $$
declare
  found_count integer;
begin
  select count(*) into found_count from _dp_qb_removed_subjects;
  if found_count not in (0, 3) then
    raise exception 'Retired Question Bank subject set is incomplete: found % of 3',
      found_count;
  end if;
end;
$$;

create temporary table _dp_qb_removed_courses on commit drop as
select id from public.dp_qb_courses
where subject_id in (select id from _dp_qb_removed_subjects);
create unique index on _dp_qb_removed_courses(id);

create temporary table _dp_qb_removed_datasets on commit drop as
select id from public.dp_qb_datasets
where course_id in (select id from _dp_qb_removed_courses);
create unique index on _dp_qb_removed_datasets(id);

create temporary table _dp_qb_removed_topics on commit drop as
select id from public.dp_qb_topics
where course_id in (select id from _dp_qb_removed_courses);
create unique index on _dp_qb_removed_topics(id);

create temporary table _dp_qb_removed_subtopics on commit drop as
select id from public.dp_qb_subtopics
where course_id in (select id from _dp_qb_removed_courses);
create unique index on _dp_qb_removed_subtopics(id);

create temporary table _dp_qb_removed_variants on commit drop as
select id, question_id from public.dp_qb_question_variants
where course_id in (select id from _dp_qb_removed_courses);
create unique index on _dp_qb_removed_variants(id);
create index on _dp_qb_removed_variants(question_id);

create temporary table _dp_qb_removed_questions on commit drop as
select distinct removed.question_id as id
from _dp_qb_removed_variants removed
where not exists (
  select 1 from public.dp_qb_question_variants retained
  where retained.question_id = removed.question_id
    and retained.id not in (select id from _dp_qb_removed_variants)
);
create unique index on _dp_qb_removed_questions(id);

create temporary table _dp_qb_removed_assets on commit drop as
select distinct asset.id
from public.dp_qb_assets asset
join public.dp_qb_variant_assets link on link.asset_id = asset.id
where link.variant_id in (select id from _dp_qb_removed_variants)
  and not exists (
    select 1 from public.dp_qb_variant_assets retained
    where retained.asset_id = asset.id
      and retained.variant_id not in (select id from _dp_qb_removed_variants)
  )
  and not exists (
    select 1
    from public.dp_qb_paper_assets paper_asset
    where paper_asset.asset_id = asset.id
      and (
        exists (
          select 1
          from public.dp_qb_course_papers course_paper
          where course_paper.paper_id = paper_asset.paper_id
            and course_paper.course_id not in (select id from _dp_qb_removed_courses)
        )
        or exists (
          select 1
          from public.dp_qb_question_variants retained_variant
          where retained_variant.paper_id = paper_asset.paper_id
            and retained_variant.id not in (select id from _dp_qb_removed_variants)
        )
      )
  );
create unique index on _dp_qb_removed_assets(id);

insert into public.dp_qb_asset_deletion_queue (
  asset_id, storage_provider, storage_bucket, storage_key, byte_size
)
select id, storage_provider, storage_bucket, storage_key, byte_size
from public.dp_qb_assets
where id in (select id from _dp_qb_removed_assets)
on conflict (asset_id) do nothing;

create temporary table _dp_qb_removed_sessions on commit drop as
select distinct session.id
from public.dp_qb_practice_sessions session
where exists (
  select 1 from public.dp_qb_practice_session_items item
  where item.session_id = session.id
    and (
      item.variant_id in (select id from _dp_qb_removed_variants)
      or item.question_id in (select id from _dp_qb_removed_questions)
    )
)
or exists (
  select 1
  from jsonb_array_elements(session.configuration_snapshot -> 'blocks') block(value)
  where block.value ->> 'conceptId' in (
    select id::text from public.dp_qb_concepts
    where subject_id in (select id from _dp_qb_removed_subjects)
  )
  or block.value ->> 'courseId' in (select id::text from _dp_qb_removed_courses)
  or exists (
    select 1 from jsonb_array_elements_text(
      coalesce(block.value -> 'courseIds', '[]'::jsonb)
    ) course(id)
    where course.id in (select id::text from _dp_qb_removed_courses)
  )
);

create temporary table _dp_qb_removed_shares on commit drop as
select distinct share.id
from public.dp_qb_practice_shares share
where exists (
  select 1 from public.dp_qb_practice_share_items item
  where item.share_id = share.id
    and (
      item.variant_id in (select id from _dp_qb_removed_variants)
      or item.question_id in (select id from _dp_qb_removed_questions)
    )
)
or exists (
  select 1
  from jsonb_array_elements(share.configuration_snapshot -> 'blocks') block(value)
  where block.value ->> 'conceptId' in (
    select id::text from public.dp_qb_concepts
    where subject_id in (select id from _dp_qb_removed_subjects)
  )
  or block.value ->> 'courseId' in (select id::text from _dp_qb_removed_courses)
  or exists (
    select 1 from jsonb_array_elements_text(
      coalesce(block.value -> 'courseIds', '[]'::jsonb)
    ) course(id)
    where course.id in (select id::text from _dp_qb_removed_courses)
  )
);

create temporary table _dp_qb_removed_sets on commit drop as
select distinct block.practice_set_id as id
from public.dp_qb_practice_set_blocks block
where block.course_id in (select id from _dp_qb_removed_courses)
   or block.concept_id in (
     select id from public.dp_qb_concepts
     where subject_id in (select id from _dp_qb_removed_subjects)
   )
   or exists (
     select 1 from public.dp_qb_practice_set_block_courses block_course
     where block_course.block_id = block.id
       and block_course.course_id in (select id from _dp_qb_removed_courses)
   );

delete from public.dp_qb_practice_shares
where id in (select id from _dp_qb_removed_shares);
delete from public.dp_qb_practice_sessions
where id in (select id from _dp_qb_removed_sessions);
delete from public.dp_qb_practice_sets
where id in (select id from _dp_qb_removed_sets);

delete from public.dp_qb_concepts
where subject_id in (select id from _dp_qb_removed_subjects);
delete from public.dp_qb_concept_groups
where subject_id in (select id from _dp_qb_removed_subjects)
  and parent_group_id is not null;
delete from public.dp_qb_concept_groups
where subject_id in (select id from _dp_qb_removed_subjects);

delete from public.dp_qb_questions
where id in (select id from _dp_qb_removed_questions);

delete from public.dp_qb_topic_source_memberships
where source_topic_id in (
  select source_topic_id from public.dp_qb_topic_sources
  where course_id in (select id from _dp_qb_removed_courses)
)
or topic_id in (select id from _dp_qb_removed_topics);
delete from public.dp_qb_subtopic_source_topic_memberships
where source_subtopic_id in (
  select source_subtopic_id from public.dp_qb_subtopic_sources
  where course_id in (select id from _dp_qb_removed_courses)
)
or topic_id in (select id from _dp_qb_removed_topics);
delete from public.dp_qb_subtopic_sources
where course_id in (select id from _dp_qb_removed_courses)
   or topic_id in (select id from _dp_qb_removed_topics)
   or subtopic_id in (select id from _dp_qb_removed_subtopics);
delete from public.dp_qb_topic_sources
where course_id in (select id from _dp_qb_removed_courses)
   or topic_id in (select id from _dp_qb_removed_topics);

delete from public.dp_qb_datasets
where id in (select id from _dp_qb_removed_datasets);
delete from public.dp_qb_courses
where id in (select id from _dp_qb_removed_courses);

delete from public.dp_qb_papers paper
where not exists (
  select 1 from public.dp_qb_course_papers link where link.paper_id = paper.id
)
and not exists (
  select 1 from public.dp_qb_question_variants variant where variant.paper_id = paper.id
)
and not exists (
  select 1 from public.dp_qb_variant_papers link where link.paper_id = paper.id
);
delete from public.dp_qb_solution_videos video
where not exists (
  select 1 from public.dp_qb_variant_solution_videos link where link.video_id = video.id
);
delete from public.dp_qb_assets
where id in (select id from _dp_qb_removed_assets);
delete from public.dp_qb_subjects
where id in (select id from _dp_qb_removed_subjects);

drop table if exists public.dp_qb_exam_mate_import_stage;

do $$
begin
  if exists (
    select 1 from public.dp_qb_subjects
    where id in ('english-b', 'philosophy', 'world-religions')
  ) then
    raise exception 'Retired Question Bank subjects remain after cleanup';
  end if;
  if exists (
    select 1
    from public.dp_qb_question_variants variant
    join public.dp_qb_courses course on course.id = variant.course_id
    where course.subject_id in ('english-b', 'philosophy', 'world-religions')
  ) then
    raise exception 'Retired Question Bank variants remain after cleanup';
  end if;
end;
$$;


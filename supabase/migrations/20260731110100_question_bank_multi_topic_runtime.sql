-- Make the singular physical taxonomy and many-to-many memberships permanent
-- across every existing importer and member-facing Question Bank RPC.

set lock_timeout = '10s';
set statement_timeout = '120s';

create or replace function private.dp_qb_source_topic_components(
  p_course_id uuid,
  p_source_name text
)
returns table (
  topic_id uuid,
  membership_order integer,
  is_primary boolean
)
language sql
stable
parallel safe
set search_path = ''
as $$
  with parts as (
    select
      part.ordinality::integer as source_order,
      btrim(part.value) as part_name
    from unnest(string_to_array(coalesce(p_source_name, ''), ','))
      with ordinality as part(value, ordinality)
  ),
  resolved as (
    select
      parts.source_order,
      topic.id as topic_id
    from parts
    left join public.dp_qb_topics topic
      on topic.course_id = p_course_id
     and topic.canonical_key =
       private.dp_qb_canonical_taxonomy_key(parts.part_name)
  ),
  validity as (
    select count(*) as part_count, count(topic_id) as resolved_count
    from resolved
  ),
  deduplicated as (
    select topic_id, min(source_order) as first_source_order
    from resolved, validity
    where validity.part_count > 1
      and validity.part_count = validity.resolved_count
    group by topic_id
  ),
  ordered as (
    select
      topic_id,
      row_number() over (order by first_source_order, topic_id)::integer - 1
        as membership_order
    from deduplicated
  )
  select
    ordered.topic_id,
    ordered.membership_order,
    ordered.membership_order = 0 as is_primary
  from ordered
  order by ordered.membership_order;
$$;

create or replace function private.dp_qb_resolve_subtopic_source_id(input uuid)
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.dp_qb_subtopic_sources source
      where source.source_subtopic_id = input
    ) then (
      select source.subtopic_id
      from public.dp_qb_subtopic_sources source
      where source.source_subtopic_id = input
    )
    else input
  end;
$$;

create or replace function private.dp_qb_topics_canonicalize_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_id uuid := new.id;
  original_dataset_id uuid := new.dataset_id;
  original_course_id uuid := new.course_id;
  original_slug text := new.slug;
  original_name text := new.name;
  original_sort_order integer := new.sort_order;
  original_created_by_batch_id uuid := new.created_by_batch_id;
  original_last_seen_batch_id uuid := new.last_seen_batch_id;
  original_created_at timestamptz := new.created_at;
  original_updated_at timestamptz := new.updated_at;
  normalized_name text;
  normalized_key text;
  component_count integer;
  primary_topic public.dp_qb_topics%rowtype;
  canonical public.dp_qb_topics%rowtype;
begin
  normalized_name := private.dp_qb_canonical_taxonomy_name(new.name);
  normalized_key := private.dp_qb_canonical_taxonomy_key(new.name);
  if normalized_key = '' then
    raise exception 'Question Bank topic canonical key cannot be blank';
  end if;

  select count(*)
  into component_count
  from private.dp_qb_source_topic_components(new.course_id, original_name);

  if component_count > 1 then
    select topic.*
    into primary_topic
    from private.dp_qb_source_topic_components(
      new.course_id,
      original_name
    ) component
    join public.dp_qb_topics topic on topic.id = component.topic_id
    where component.is_primary;

    insert into public.dp_qb_topic_sources (
      source_topic_id,
      topic_id,
      dataset_id,
      course_id,
      source_slug,
      source_name,
      source_sort_order,
      source_created_by_batch_id,
      source_last_seen_batch_id,
      source_created_at,
      source_updated_at
    )
    values (
      original_id,
      primary_topic.id,
      original_dataset_id,
      original_course_id,
      original_slug,
      original_name,
      original_sort_order,
      original_created_by_batch_id,
      original_last_seen_batch_id,
      original_created_at,
      original_updated_at
    )
    on conflict (source_topic_id) do update set
      topic_id = excluded.topic_id,
      dataset_id = excluded.dataset_id,
      course_id = excluded.course_id,
      source_slug = excluded.source_slug,
      source_name = excluded.source_name,
      source_sort_order = excluded.source_sort_order,
      source_last_seen_batch_id = excluded.source_last_seen_batch_id,
      source_updated_at = excluded.source_updated_at,
      updated_at = now();

    delete from public.dp_qb_topic_source_memberships membership
    where membership.source_topic_id = original_id;

    insert into public.dp_qb_topic_source_memberships (
      source_topic_id,
      topic_id,
      membership_order,
      is_primary
    )
    select
      original_id,
      component.topic_id,
      component.membership_order,
      component.is_primary
    from private.dp_qb_source_topic_components(
      original_course_id,
      original_name
    ) component;

    new.id := primary_topic.id;
    new.dataset_id := primary_topic.dataset_id;
    new.course_id := primary_topic.course_id;
    new.slug := primary_topic.slug;
    new.name := primary_topic.name;
    new.sort_order := primary_topic.sort_order;
    new.created_by_batch_id := primary_topic.created_by_batch_id;
    new.last_seen_batch_id :=
      coalesce(original_last_seen_batch_id, primary_topic.last_seen_batch_id);
    new.created_at := primary_topic.created_at;
    new.updated_at := greatest(
      coalesce(original_updated_at, primary_topic.updated_at),
      primary_topic.updated_at
    );
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.course_id::text || ':' || normalized_key,
      0
    )
  );

  select existing.*
  into canonical
  from public.dp_qb_topics existing
  where existing.course_id = new.course_id
    and existing.canonical_key = normalized_key
    and existing.id <> new.id
  order by existing.sort_order, existing.id
  limit 1;

  if found then
    insert into public.dp_qb_topic_sources (
      source_topic_id,
      topic_id,
      dataset_id,
      course_id,
      source_slug,
      source_name,
      source_sort_order,
      source_created_by_batch_id,
      source_last_seen_batch_id,
      source_created_at,
      source_updated_at
    )
    values (
      original_id,
      canonical.id,
      original_dataset_id,
      original_course_id,
      original_slug,
      original_name,
      original_sort_order,
      original_created_by_batch_id,
      original_last_seen_batch_id,
      original_created_at,
      original_updated_at
    )
    on conflict (source_topic_id) do update set
      topic_id = excluded.topic_id,
      dataset_id = excluded.dataset_id,
      course_id = excluded.course_id,
      source_slug = excluded.source_slug,
      source_name = excluded.source_name,
      source_sort_order = excluded.source_sort_order,
      source_last_seen_batch_id = excluded.source_last_seen_batch_id,
      source_updated_at = excluded.source_updated_at,
      updated_at = now();

    delete from public.dp_qb_topic_source_memberships membership
    where membership.source_topic_id = original_id;
    insert into public.dp_qb_topic_source_memberships (
      source_topic_id,
      topic_id,
      membership_order,
      is_primary
    ) values (original_id, canonical.id, 0, true);

    new.id := canonical.id;
    new.dataset_id := canonical.dataset_id;
    new.course_id := canonical.course_id;
    new.slug := canonical.slug;
    new.name := canonical.name;
    new.sort_order := canonical.sort_order;
    new.created_by_batch_id := canonical.created_by_batch_id;
    new.last_seen_batch_id :=
      coalesce(original_last_seen_batch_id, canonical.last_seen_batch_id);
    new.created_at := canonical.created_at;
    new.updated_at := greatest(
      coalesce(original_updated_at, canonical.updated_at),
      canonical.updated_at
    );
    return new;
  end if;

  new.name := coalesce(nullif(normalized_name, ''), new.name);

  insert into public.dp_qb_topic_sources (
    source_topic_id,
    topic_id,
    dataset_id,
    course_id,
    source_slug,
    source_name,
    source_sort_order,
    source_created_by_batch_id,
    source_last_seen_batch_id,
    source_created_at,
    source_updated_at
  )
  values (
    original_id,
    new.id,
    original_dataset_id,
    original_course_id,
    original_slug,
    original_name,
    original_sort_order,
    original_created_by_batch_id,
    original_last_seen_batch_id,
    original_created_at,
    original_updated_at
  )
  on conflict (source_topic_id) do update set
    topic_id = excluded.topic_id,
    dataset_id = excluded.dataset_id,
    course_id = excluded.course_id,
    source_slug = excluded.source_slug,
    source_name = excluded.source_name,
    source_sort_order = excluded.source_sort_order,
    source_last_seen_batch_id = excluded.source_last_seen_batch_id,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  delete from public.dp_qb_topic_source_memberships membership
  where membership.source_topic_id = original_id;
  insert into public.dp_qb_topic_source_memberships (
    source_topic_id,
    topic_id,
    membership_order,
    is_primary
  ) values (original_id, new.id, 0, true);

  return new;
end;
$$;

create or replace function private.dp_qb_subtopics_canonicalize_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_id uuid := new.id;
  original_topic_id uuid := new.topic_id;
  original_course_id uuid := new.course_id;
  original_slug text := new.slug;
  original_name text := new.name;
  original_code text := new.code;
  original_description text := new.description;
  original_sort_order integer := new.sort_order;
  original_created_by_batch_id uuid := new.created_by_batch_id;
  original_last_seen_batch_id uuid := new.last_seen_batch_id;
  original_created_at timestamptz := new.created_at;
  original_updated_at timestamptz := new.updated_at;
  canonical_topic_id uuid;
  normalized_name text;
  normalized_key text;
  source_topic_key text;
  parent_membership_count integer;
  canonical public.dp_qb_subtopics%rowtype;
begin
  canonical_topic_id := private.dp_qb_resolve_topic_source_id(original_topic_id);
  new.topic_id := canonical_topic_id;
  normalized_name := private.dp_qb_canonical_taxonomy_name(new.name);
  normalized_key := private.dp_qb_canonical_taxonomy_key(new.name);
  if normalized_key = '' then
    raise exception 'Question Bank subtopic canonical key cannot be blank';
  end if;

  select
    private.dp_qb_canonical_taxonomy_key(source.source_name),
    count(membership.topic_id)
  into source_topic_key, parent_membership_count
  from public.dp_qb_topic_sources source
  left join public.dp_qb_topic_source_memberships membership
    on membership.source_topic_id = source.source_topic_id
  where source.source_topic_id = original_topic_id
  group by source.source_name;

  if coalesce(parent_membership_count, 0) > 1
     and normalized_key = source_topic_key then
    insert into public.dp_qb_subtopic_sources (
      source_subtopic_id,
      subtopic_id,
      source_topic_id,
      topic_id,
      course_id,
      source_slug,
      source_name,
      source_code,
      source_description,
      source_sort_order,
      source_created_by_batch_id,
      source_last_seen_batch_id,
      source_created_at,
      source_updated_at,
      is_topic_only
    ) values (
      original_id,
      null,
      original_topic_id,
      canonical_topic_id,
      original_course_id,
      original_slug,
      original_name,
      original_code,
      original_description,
      original_sort_order,
      original_created_by_batch_id,
      original_last_seen_batch_id,
      original_created_at,
      original_updated_at,
      true
    )
    on conflict (source_subtopic_id) do update set
      subtopic_id = null,
      source_topic_id = excluded.source_topic_id,
      topic_id = excluded.topic_id,
      course_id = excluded.course_id,
      source_slug = excluded.source_slug,
      source_name = excluded.source_name,
      source_code = excluded.source_code,
      source_description = excluded.source_description,
      source_sort_order = excluded.source_sort_order,
      source_last_seen_batch_id = excluded.source_last_seen_batch_id,
      source_updated_at = excluded.source_updated_at,
      is_topic_only = true,
      updated_at = now();

    delete from public.dp_qb_subtopic_source_topic_memberships membership
    where membership.source_subtopic_id = original_id;
    insert into public.dp_qb_subtopic_source_topic_memberships (
      source_subtopic_id,
      topic_id,
      membership_order
    )
    select
      original_id,
      membership.topic_id,
      membership.membership_order
    from public.dp_qb_topic_source_memberships membership
    where membership.source_topic_id = original_topic_id;

    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      canonical_topic_id::text || ':' || normalized_key,
      0
    )
  );

  select existing.*
  into canonical
  from public.dp_qb_subtopics existing
  where existing.topic_id = canonical_topic_id
    and existing.canonical_key = normalized_key
    and existing.id <> new.id
  order by existing.sort_order, existing.id
  limit 1;

  if found then
    insert into public.dp_qb_subtopic_sources (
      source_subtopic_id,
      subtopic_id,
      source_topic_id,
      topic_id,
      course_id,
      source_slug,
      source_name,
      source_code,
      source_description,
      source_sort_order,
      source_created_by_batch_id,
      source_last_seen_batch_id,
      source_created_at,
      source_updated_at,
      is_topic_only
    ) values (
      original_id,
      canonical.id,
      original_topic_id,
      canonical_topic_id,
      original_course_id,
      original_slug,
      original_name,
      original_code,
      original_description,
      original_sort_order,
      original_created_by_batch_id,
      original_last_seen_batch_id,
      original_created_at,
      original_updated_at,
      false
    )
    on conflict (source_subtopic_id) do update set
      subtopic_id = excluded.subtopic_id,
      source_topic_id = excluded.source_topic_id,
      topic_id = excluded.topic_id,
      course_id = excluded.course_id,
      source_slug = excluded.source_slug,
      source_name = excluded.source_name,
      source_code = excluded.source_code,
      source_description = excluded.source_description,
      source_sort_order = excluded.source_sort_order,
      source_last_seen_batch_id = excluded.source_last_seen_batch_id,
      source_updated_at = excluded.source_updated_at,
      is_topic_only = false,
      updated_at = now();

    new.id := canonical.id;
    new.topic_id := canonical.topic_id;
    new.course_id := canonical.course_id;
    new.slug := canonical.slug;
    new.name := canonical.name;
    new.code := canonical.code;
    new.description := canonical.description;
    new.sort_order := canonical.sort_order;
    new.created_by_batch_id := canonical.created_by_batch_id;
    new.last_seen_batch_id :=
      coalesce(original_last_seen_batch_id, canonical.last_seen_batch_id);
    new.created_at := canonical.created_at;
    new.updated_at := greatest(
      coalesce(original_updated_at, canonical.updated_at),
      canonical.updated_at
    );
  else
    new.name := coalesce(nullif(normalized_name, ''), new.name);
    insert into public.dp_qb_subtopic_sources (
      source_subtopic_id,
      subtopic_id,
      source_topic_id,
      topic_id,
      course_id,
      source_slug,
      source_name,
      source_code,
      source_description,
      source_sort_order,
      source_created_by_batch_id,
      source_last_seen_batch_id,
      source_created_at,
      source_updated_at,
      is_topic_only
    ) values (
      original_id,
      new.id,
      original_topic_id,
      canonical_topic_id,
      original_course_id,
      original_slug,
      original_name,
      original_code,
      original_description,
      original_sort_order,
      original_created_by_batch_id,
      original_last_seen_batch_id,
      original_created_at,
      original_updated_at,
      false
    )
    on conflict (source_subtopic_id) do update set
      subtopic_id = excluded.subtopic_id,
      source_topic_id = excluded.source_topic_id,
      topic_id = excluded.topic_id,
      course_id = excluded.course_id,
      source_slug = excluded.source_slug,
      source_name = excluded.source_name,
      source_code = excluded.source_code,
      source_description = excluded.source_description,
      source_sort_order = excluded.source_sort_order,
      source_last_seen_batch_id = excluded.source_last_seen_batch_id,
      source_updated_at = excluded.source_updated_at,
      is_topic_only = false,
      updated_at = now();
  end if;

  delete from public.dp_qb_subtopic_source_topic_memberships membership
  where membership.source_subtopic_id = original_id;
  insert into public.dp_qb_subtopic_source_topic_memberships (
    source_subtopic_id,
    topic_id,
    membership_order
  )
  select
    original_id,
    membership.topic_id,
    membership.membership_order
  from public.dp_qb_topic_source_memberships membership
  where membership.source_topic_id = original_topic_id;

  return new;
end;
$$;

create or replace function private.dp_qb_variants_canonicalize_taxonomy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.source_topic_id := coalesce(new.source_topic_id, new.topic_id);
  new.topic_id := private.dp_qb_resolve_topic_source_id(new.source_topic_id);
  if new.canonical_source_subtopic_id is not null then
    new.canonical_source_subtopic_id :=
      private.dp_qb_resolve_subtopic_source_id(
        new.canonical_source_subtopic_id
      );
  end if;
  return new;
end;
$$;

create or replace function private.dp_qb_sync_variant_topics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dp_qb_variant_topics membership
  where membership.variant_id = new.id;

  insert into public.dp_qb_variant_topics (
    variant_id,
    topic_id,
    membership_order,
    is_primary
  )
  select
    new.id,
    membership.topic_id,
    membership.membership_order,
    membership.is_primary
  from public.dp_qb_topic_source_memberships membership
  where membership.source_topic_id = new.source_topic_id;

  if not found then
    insert into public.dp_qb_variant_topics (
      variant_id,
      topic_id,
      membership_order,
      is_primary
    ) values (new.id, new.topic_id, 0, true);
  end if;
  return new;
end;
$$;

create or replace function private.dp_qb_placements_canonicalize_taxonomy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_subtopic_id uuid := new.subtopic_id;
  resolved_subtopic_id uuid;
begin
  resolved_subtopic_id :=
    private.dp_qb_resolve_subtopic_source_id(original_subtopic_id);

  if resolved_subtopic_id is null then
    insert into public.dp_qb_variant_topic_only_sources (
      variant_id,
      source_subtopic_id,
      placement_order,
      placement_difficulty,
      is_fallback,
      fallback_reason,
      created_by_batch_id,
      last_seen_batch_id,
      updated_at
    ) values (
      new.variant_id,
      original_subtopic_id,
      new.placement_order,
      new.placement_difficulty,
      new.is_fallback,
      new.fallback_reason,
      new.created_by_batch_id,
      new.last_seen_batch_id,
      now()
    )
    on conflict (variant_id, source_subtopic_id) do update set
      placement_order = excluded.placement_order,
      placement_difficulty = excluded.placement_difficulty,
      is_fallback = excluded.is_fallback,
      fallback_reason = excluded.fallback_reason,
      last_seen_batch_id = excluded.last_seen_batch_id,
      updated_at = now();
    return null;
  end if;

  new.subtopic_id := resolved_subtopic_id;
  return new;
end;
$$;

drop trigger if exists dp_qb_variants_canonicalize_taxonomy
  on public.dp_qb_question_variants;
create trigger dp_qb_variants_canonicalize_taxonomy
before insert or update of
  topic_id,
  canonical_source_subtopic_id,
  source_topic_id
on public.dp_qb_question_variants
for each row
execute function private.dp_qb_variants_canonicalize_taxonomy();

drop trigger if exists dp_qb_sync_variant_topics
  on public.dp_qb_question_variants;
create trigger dp_qb_sync_variant_topics
after insert or update of topic_id, source_topic_id
on public.dp_qb_question_variants
for each row
execute function private.dp_qb_sync_variant_topics();

create or replace function private.dp_qb_variant_topic_names(p_variant_id uuid)
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce(
    string_agg(topic.name, ' · ' order by membership.membership_order),
    (
      select fallback_topic.name
      from public.dp_qb_question_variants variant
      join public.dp_qb_topics fallback_topic
        on fallback_topic.id = variant.topic_id
      where variant.id = p_variant_id
    )
  )
  from public.dp_qb_variant_topics membership
  join public.dp_qb_topics topic on topic.id = membership.topic_id
  where membership.variant_id = p_variant_id;
$$;

create or replace function public.dp_qb_list_questions(
  p_course_id uuid,
  p_query text default null,
  p_topic_id uuid default null,
  p_subtopic_id uuid default null,
  p_difficulty text default null,
  p_paper_id uuid default null,
  p_section text default null,
  p_calculator boolean default null,
  p_status text default null,
  p_saved boolean default null,
  p_revisit boolean default null,
  p_page integer default 1,
  p_page_size integer default 24
)
returns table (
  variant_id uuid,
  question_id uuid,
  reference text,
  content_preview text,
  maximum_mark integer,
  difficulty_value integer,
  difficulty_label text,
  section text,
  calculator_allowed boolean,
  topic_id uuid,
  topic_name text,
  paper_id uuid,
  paper_reference text,
  subtopic_names text[],
  progress_status text,
  to_revisit boolean,
  is_saved boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := (select auth.uid());
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer :=
    least(greatest(coalesce(p_page_size, 24), 1), 100);
begin
  if requesting_user is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select
      variant.id as variant_id,
      question.id as question_id,
      question.reference,
      left(regexp_replace(question.content, '\s+', ' ', 'g'), 280)
        as content_preview,
      question.maximum_mark,
      variant.difficulty_value,
      variant.difficulty_label,
      coalesce(variant.section_raw, variant.section_normalized) as section,
      variant.calculator_allowed,
      primary_topic.id as topic_id,
      private.dp_qb_variant_topic_names(variant.id) as topic_name,
      paper.id as paper_id,
      paper.reference as paper_reference,
      private.dp_qb_variant_canonical_subtopics(variant.id)
        as subtopic_names,
      coalesce(progress.status, 'not_started') as progress_status,
      coalesce(progress.to_revisit, false) as to_revisit,
      saved.question_id is not null as is_saved,
      primary_topic.sort_order,
      variant.source_index
    from public.dp_qb_question_variants variant
    join public.dp_qb_questions question on question.id = variant.question_id
    join public.dp_qb_topics primary_topic
      on primary_topic.id = variant.topic_id
    left join public.dp_qb_papers paper on paper.id = variant.paper_id
    left join public.dp_qb_user_progress progress
      on progress.user_id = requesting_user
     and progress.question_id = question.id
    left join public.dp_qb_user_saved_questions saved
      on saved.user_id = requesting_user
     and saved.question_id = question.id
    left join public.dp_qb_question_search search_document
      on search_document.variant_id = variant.id
    where variant.course_id = p_course_id
      and variant.render_status = 'ready'
      and (
        p_topic_id is null
        or exists (
          select 1
          from public.dp_qb_variant_topics membership
          where membership.variant_id = variant.id
            and membership.topic_id = p_topic_id
        )
      )
      and (
        p_subtopic_id is null
        or private.dp_qb_variant_has_canonical_subtopic(
          variant.id,
          (
            select selected.canonical_key
            from public.dp_qb_subtopics selected
            where selected.id = p_subtopic_id
              and selected.course_id = p_course_id
          ),
          (
            select parent.canonical_key
            from public.dp_qb_subtopics selected
            join public.dp_qb_topics parent
              on parent.id = selected.topic_id
            where selected.id = p_subtopic_id
              and selected.course_id = p_course_id
          )
        )
      )
      and (
        p_difficulty is null
        or variant.difficulty_label = lower(p_difficulty)
      )
      and (p_paper_id is null or variant.paper_id = p_paper_id)
      and (
        p_section is null
        or variant.section_normalized = upper(p_section)
      )
      and (
        p_calculator is null
        or variant.calculator_allowed = p_calculator
      )
      and (
        p_status is null
        or coalesce(progress.status, 'not_started') = p_status
      )
      and (
        p_saved is null
        or (saved.question_id is not null) = p_saved
      )
      and (
        p_revisit is null
        or coalesce(progress.to_revisit, false) = p_revisit
      )
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or search_document.search_vector @@
          websearch_to_tsquery('simple', p_query)
        or question.reference ilike '%' || p_query || '%'
      )
  )
  select
    filtered.variant_id,
    filtered.question_id,
    filtered.reference,
    filtered.content_preview,
    filtered.maximum_mark,
    filtered.difficulty_value,
    filtered.difficulty_label,
    filtered.section,
    filtered.calculator_allowed,
    filtered.topic_id,
    filtered.topic_name,
    filtered.paper_id,
    filtered.paper_reference,
    filtered.subtopic_names,
    filtered.progress_status,
    filtered.to_revisit,
    filtered.is_saved,
    count(*) over()
  from filtered
  order by filtered.sort_order, filtered.source_index, filtered.variant_id
  limit safe_page_size
  offset (safe_page - 1) * safe_page_size;
end;
$$;

create or replace function public.dp_qb_search_questions(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  variant_id uuid,
  question_id uuid,
  reference text,
  content_preview text,
  maximum_mark integer,
  subject_slug text,
  subject_name text,
  course_slug text,
  course_name text,
  topic_name text,
  subtopic_names text[],
  paper_reference text,
  difficulty_label text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;

  return query
  select
    variant.id,
    question.id,
    question.reference,
    left(regexp_replace(question.content, '\s+', ' ', 'g'), 280),
    question.maximum_mark,
    subject.slug,
    subject.name,
    course.slug,
    course.name,
    private.dp_qb_variant_topic_names(variant.id),
    private.dp_qb_variant_canonical_subtopics(variant.id),
    paper.reference,
    variant.difficulty_label,
    count(*) over()
  from public.dp_qb_question_search search_document
  join public.dp_qb_question_variants variant
    on variant.id = search_document.variant_id
  join public.dp_qb_questions question on question.id = variant.question_id
  join public.dp_qb_courses course on course.id = variant.course_id
  join public.dp_qb_subjects subject on subject.id = course.subject_id
  left join public.dp_qb_papers paper on paper.id = variant.paper_id
  where variant.render_status = 'ready'
    and (
      search_document.search_vector @@
        websearch_to_tsquery('simple', p_query)
      or question.reference ilike '%' || p_query || '%'
    )
  order by
    ts_rank(
      search_document.search_vector,
      websearch_to_tsquery('simple', p_query)
    ) desc,
    question.reference,
    variant.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.dp_qb_list_questions(
  uuid,text,uuid,uuid,text,uuid,text,boolean,text,boolean,boolean,integer,integer
) from anon;
grant execute on function public.dp_qb_list_questions(
  uuid,text,uuid,uuid,text,uuid,text,boolean,text,boolean,boolean,integer,integer
) to authenticated;
revoke execute on function public.dp_qb_search_questions(text,integer,integer)
  from anon;
grant execute on function public.dp_qb_search_questions(text,integer,integer)
  to authenticated;

revoke all on function private.dp_qb_source_topic_components(uuid,text)
  from public, anon, authenticated;
revoke all on function private.dp_qb_resolve_subtopic_source_id(uuid)
  from public, anon, authenticated;
revoke all on function private.dp_qb_topics_canonicalize_write()
  from public, anon, authenticated;
revoke all on function private.dp_qb_subtopics_canonicalize_write()
  from public, anon, authenticated;
revoke all on function private.dp_qb_variants_canonicalize_taxonomy()
  from public, anon, authenticated;
revoke all on function private.dp_qb_sync_variant_topics()
  from public, anon, authenticated;
revoke all on function private.dp_qb_placements_canonicalize_taxonomy()
  from public, anon, authenticated;
revoke all on function private.dp_qb_variant_topic_names(uuid)
  from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.dp_qb_question_variants variant
    left join public.dp_qb_variant_topics membership
      on membership.variant_id = variant.id
     and membership.is_primary
    where membership.topic_id is distinct from variant.topic_id
  ) then
    raise exception 'Variant topic memberships are not synchronized';
  end if;
  if has_table_privilege(
    'anon',
    'public.dp_qb_variant_topics',
    'select'
  ) or has_table_privilege(
    'authenticated',
    'public.dp_qb_variant_topics',
    'select'
  ) then
    raise exception 'Variant topic memberships are exposed directly';
  end if;
  if has_function_privilege(
    'anon',
    'public.dp_qb_list_questions(uuid,text,uuid,uuid,text,uuid,text,boolean,text,boolean,boolean,integer,integer)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.dp_qb_search_questions(text,integer,integer)',
    'execute'
  ) then
    raise exception 'Question Bank RPC access was broadened to anon';
  end if;
end;
$$;

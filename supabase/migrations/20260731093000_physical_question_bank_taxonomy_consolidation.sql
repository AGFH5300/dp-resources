-- Physically consolidate duplicate Question Bank taxonomy rows while preserving
-- every source-specific ID, label, dataset and batch reference in alias tables.

set lock_timeout = '10s';
set statement_timeout = '120s';

create table if not exists public.dp_qb_topic_sources (
  source_topic_id uuid primary key,
  topic_id uuid not null,
  dataset_id uuid not null,
  course_id uuid not null,
  source_slug text not null,
  source_name text not null,
  source_sort_order integer not null default 0,
  source_created_by_batch_id uuid,
  source_last_seen_batch_id uuid,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dp_qb_topic_sources_topic_id_fkey
    foreign key (topic_id) references public.dp_qb_topics(id)
    on delete restrict deferrable initially deferred,
  constraint dp_qb_topic_sources_dataset_id_fkey
    foreign key (dataset_id) references public.dp_qb_datasets(id)
    on delete cascade,
  constraint dp_qb_topic_sources_course_id_fkey
    foreign key (course_id) references public.dp_qb_courses(id)
    on delete restrict,
  constraint dp_qb_topic_sources_created_batch_fkey
    foreign key (source_created_by_batch_id)
    references public.dp_qb_import_batches(id) on delete set null,
  constraint dp_qb_topic_sources_last_seen_batch_fkey
    foreign key (source_last_seen_batch_id)
    references public.dp_qb_import_batches(id) on delete set null,
  unique (dataset_id)
);

create index if not exists dp_qb_topic_sources_topic_idx
  on public.dp_qb_topic_sources (topic_id, source_topic_id);
create index if not exists dp_qb_topic_sources_course_idx
  on public.dp_qb_topic_sources (course_id, source_slug);

create table if not exists public.dp_qb_subtopic_sources (
  source_subtopic_id uuid primary key,
  subtopic_id uuid not null,
  source_topic_id uuid not null,
  topic_id uuid not null,
  course_id uuid not null,
  source_slug text not null,
  source_name text not null,
  source_code text not null default '',
  source_description text not null default '',
  source_sort_order integer not null default 0,
  source_created_by_batch_id uuid,
  source_last_seen_batch_id uuid,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dp_qb_subtopic_sources_subtopic_id_fkey
    foreign key (subtopic_id) references public.dp_qb_subtopics(id)
    on delete restrict deferrable initially deferred,
  constraint dp_qb_subtopic_sources_topic_id_fkey
    foreign key (topic_id) references public.dp_qb_topics(id)
    on delete restrict deferrable initially deferred,
  constraint dp_qb_subtopic_sources_course_id_fkey
    foreign key (course_id) references public.dp_qb_courses(id)
    on delete restrict,
  constraint dp_qb_subtopic_sources_created_batch_fkey
    foreign key (source_created_by_batch_id)
    references public.dp_qb_import_batches(id) on delete set null,
  constraint dp_qb_subtopic_sources_last_seen_batch_fkey
    foreign key (source_last_seen_batch_id)
    references public.dp_qb_import_batches(id) on delete set null,
  unique (source_topic_id, source_slug)
);

create index if not exists dp_qb_subtopic_sources_subtopic_idx
  on public.dp_qb_subtopic_sources (subtopic_id, source_subtopic_id);
create index if not exists dp_qb_subtopic_sources_topic_idx
  on public.dp_qb_subtopic_sources (topic_id, source_topic_id);

alter table public.dp_qb_topic_sources enable row level security;
alter table public.dp_qb_subtopic_sources enable row level security;
revoke all on public.dp_qb_topic_sources from anon, authenticated;
revoke all on public.dp_qb_subtopic_sources from anon, authenticated;
grant all on public.dp_qb_topic_sources to service_role;
grant all on public.dp_qb_subtopic_sources to service_role;

create temporary table _dp_qb_topic_representatives on commit drop as
select distinct on (t.course_id, t.canonical_key)
  t.course_id,
  t.canonical_key,
  t.id as canonical_topic_id
from public.dp_qb_topics t
join public.dp_qb_datasets d on d.id = t.dataset_id
order by
  t.course_id,
  t.canonical_key,
  case
    when lower(coalesce(d.source_metadata ->> 'provider', '')) = 'exam-mate'
      then 0
    else 1
  end,
  case when btrim(t.name) = t.canonical_name then 0 else 1 end,
  t.sort_order,
  t.id;

create temporary table _dp_qb_topic_map on commit drop as
select
  t.id as source_topic_id,
  r.canonical_topic_id,
  t.course_id,
  t.dataset_id,
  t.slug as source_slug,
  t.name as source_name,
  t.sort_order as source_sort_order,
  t.created_by_batch_id as source_created_by_batch_id,
  t.last_seen_batch_id as source_last_seen_batch_id,
  t.created_at as source_created_at,
  t.updated_at as source_updated_at
from public.dp_qb_topics t
join _dp_qb_topic_representatives r
  on r.course_id = t.course_id
 and r.canonical_key = t.canonical_key;

create temporary table _dp_qb_subtopic_representatives on commit drop as
select distinct on (
  s.course_id,
  parent.canonical_key,
  s.canonical_key
)
  s.course_id,
  parent.canonical_key as canonical_topic_key,
  s.canonical_key,
  s.id as canonical_subtopic_id,
  topic_map.canonical_topic_id
from public.dp_qb_subtopics s
join public.dp_qb_topics parent on parent.id = s.topic_id
join _dp_qb_topic_map topic_map on topic_map.source_topic_id = parent.id
order by
  s.course_id,
  parent.canonical_key,
  s.canonical_key,
  case when btrim(s.name) = s.canonical_name then 0 else 1 end,
  s.sort_order,
  s.id;

create temporary table _dp_qb_subtopic_map on commit drop as
select
  s.id as source_subtopic_id,
  reps.canonical_subtopic_id,
  s.topic_id as source_topic_id,
  reps.canonical_topic_id,
  s.course_id,
  s.slug as source_slug,
  s.name as source_name,
  s.code as source_code,
  s.description as source_description,
  s.sort_order as source_sort_order,
  s.created_by_batch_id as source_created_by_batch_id,
  s.last_seen_batch_id as source_last_seen_batch_id,
  s.created_at as source_created_at,
  s.updated_at as source_updated_at
from public.dp_qb_subtopics s
join public.dp_qb_topics parent on parent.id = s.topic_id
join _dp_qb_subtopic_representatives reps
  on reps.course_id = s.course_id
 and reps.canonical_topic_key = parent.canonical_key
 and reps.canonical_key = s.canonical_key;

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
select
  source_topic_id,
  canonical_topic_id,
  dataset_id,
  course_id,
  source_slug,
  source_name,
  source_sort_order,
  source_created_by_batch_id,
  source_last_seen_batch_id,
  source_created_at,
  source_updated_at
from _dp_qb_topic_map
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
  source_updated_at
)
select
  source_subtopic_id,
  canonical_subtopic_id,
  source_topic_id,
  canonical_topic_id,
  course_id,
  source_slug,
  source_name,
  source_code,
  source_description,
  source_sort_order,
  source_created_by_batch_id,
  source_last_seen_batch_id,
  source_created_at,
  source_updated_at
from _dp_qb_subtopic_map
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
  updated_at = now();

create temporary table _dp_qb_canonical_placements on commit drop as
select
  p.variant_id,
  sm.canonical_subtopic_id as subtopic_id,
  min(p.placement_order) as placement_order,
  (
    array_agg(
      p.placement_difficulty
      order by p.placement_order, p.subtopic_id
    ) filter (where p.placement_difficulty is not null)
  )[1] as placement_difficulty,
  bool_and(p.is_fallback) as is_fallback,
  case
    when bool_and(p.is_fallback) then (
      array_agg(
        p.fallback_reason
        order by p.placement_order, p.subtopic_id
      ) filter (where p.fallback_reason is not null)
    )[1]
    else null
  end as fallback_reason,
  (
    array_agg(
      p.created_by_batch_id
      order by p.placement_order, p.subtopic_id
    ) filter (where p.created_by_batch_id is not null)
  )[1] as created_by_batch_id,
  (
    array_agg(
      p.last_seen_batch_id
      order by p.placement_order, p.subtopic_id
    ) filter (where p.last_seen_batch_id is not null)
  )[1] as last_seen_batch_id
from public.dp_qb_question_subtopics p
join _dp_qb_subtopic_map sm on sm.source_subtopic_id = p.subtopic_id
group by p.variant_id, sm.canonical_subtopic_id;

update public.dp_qb_question_variants v
set topic_id = tm.canonical_topic_id
from _dp_qb_topic_map tm
where v.topic_id = tm.source_topic_id
  and v.topic_id <> tm.canonical_topic_id;

update public.dp_qb_question_variants v
set canonical_source_subtopic_id = sm.canonical_subtopic_id
from _dp_qb_subtopic_map sm
where v.canonical_source_subtopic_id = sm.source_subtopic_id
  and v.canonical_source_subtopic_id <> sm.canonical_subtopic_id;

delete from public.dp_qb_question_subtopics;

insert into public.dp_qb_question_subtopics (
  variant_id,
  subtopic_id,
  placement_order,
  placement_difficulty,
  is_fallback,
  fallback_reason,
  created_by_batch_id,
  last_seen_batch_id
)
select
  variant_id,
  subtopic_id,
  placement_order,
  placement_difficulty,
  is_fallback,
  fallback_reason,
  created_by_batch_id,
  last_seen_batch_id
from _dp_qb_canonical_placements;

delete from public.dp_qb_subtopics s
using _dp_qb_subtopic_map sm
where s.id = sm.source_subtopic_id
  and sm.source_subtopic_id <> sm.canonical_subtopic_id;

update public.dp_qb_subtopics s
set
  topic_id = sm.canonical_topic_id,
  name = s.canonical_name,
  sort_order = source_group.minimum_sort_order,
  code = source_group.best_code,
  description = source_group.best_description,
  updated_at = now()
from _dp_qb_subtopic_map sm
join lateral (
  select
    min(source_sort_order) as minimum_sort_order,
    coalesce((
      array_agg(
        source_code
        order by length(btrim(source_code)) desc, source_subtopic_id
      ) filter (where btrim(source_code) <> '')
    )[1], '') as best_code,
    coalesce((
      array_agg(
        source_description
        order by length(btrim(source_description)) desc, source_subtopic_id
      ) filter (where btrim(source_description) <> '')
    )[1], '') as best_description
  from _dp_qb_subtopic_map grouped
  where grouped.canonical_subtopic_id = sm.canonical_subtopic_id
) source_group on true
where s.id = sm.canonical_subtopic_id;

delete from public.dp_qb_topics t
using _dp_qb_topic_map tm
where t.id = tm.source_topic_id
  and tm.source_topic_id <> tm.canonical_topic_id;

update public.dp_qb_topics t
set
  name = t.canonical_name,
  sort_order = source_group.minimum_sort_order,
  updated_at = now()
from _dp_qb_topic_map tm
join lateral (
  select min(source_sort_order) as minimum_sort_order
  from _dp_qb_topic_map grouped
  where grouped.canonical_topic_id = tm.canonical_topic_id
) source_group on true
where t.id = tm.canonical_topic_id;

create unique index if not exists dp_qb_topics_course_canonical_key_unique
  on public.dp_qb_topics (course_id, canonical_key);

create unique index if not exists dp_qb_subtopics_topic_canonical_key_unique
  on public.dp_qb_subtopics (topic_id, canonical_key);

create or replace function private.dp_qb_resolve_topic_source_id(input uuid)
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce(
    (
      select source.topic_id
      from public.dp_qb_topic_sources source
      where source.source_topic_id = input
    ),
    input
  );
$$;

create or replace function private.dp_qb_resolve_subtopic_source_id(input uuid)
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce(
    (
      select source.subtopic_id
      from public.dp_qb_subtopic_sources source
      where source.source_subtopic_id = input
    ),
    input
  );
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
  canonical public.dp_qb_topics%rowtype;
begin
  normalized_name := private.dp_qb_canonical_taxonomy_name(new.name);
  normalized_key := private.dp_qb_canonical_taxonomy_key(new.name);
  if normalized_key = '' then
    raise exception 'Question Bank topic canonical key cannot be blank';
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
  canonical public.dp_qb_subtopics%rowtype;
begin
  canonical_topic_id := private.dp_qb_resolve_topic_source_id(new.topic_id);
  new.topic_id := canonical_topic_id;

  normalized_name := private.dp_qb_canonical_taxonomy_name(new.name);
  normalized_key := private.dp_qb_canonical_taxonomy_key(new.name);
  if normalized_key = '' then
    raise exception 'Question Bank subtopic canonical key cannot be blank';
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
      source_updated_at
    )
    values (
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
      original_updated_at
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
    return new;
  end if;

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
    source_updated_at
  )
  values (
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
    original_updated_at
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
    updated_at = now();

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
  new.topic_id := private.dp_qb_resolve_topic_source_id(new.topic_id);
  if new.canonical_source_subtopic_id is not null then
    new.canonical_source_subtopic_id :=
      private.dp_qb_resolve_subtopic_source_id(
        new.canonical_source_subtopic_id
      );
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
begin
  new.subtopic_id :=
    private.dp_qb_resolve_subtopic_source_id(new.subtopic_id);
  return new;
end;
$$;

drop trigger if exists dp_qb_topics_canonicalize_write
  on public.dp_qb_topics;
create trigger dp_qb_topics_canonicalize_write
before insert or update of
  id,
  dataset_id,
  course_id,
  slug,
  name,
  sort_order,
  created_by_batch_id,
  last_seen_batch_id,
  created_at,
  updated_at
on public.dp_qb_topics
for each row
execute function private.dp_qb_topics_canonicalize_write();

drop trigger if exists dp_qb_subtopics_canonicalize_write
  on public.dp_qb_subtopics;
create trigger dp_qb_subtopics_canonicalize_write
before insert or update of
  id,
  topic_id,
  course_id,
  slug,
  name,
  code,
  description,
  sort_order,
  created_by_batch_id,
  last_seen_batch_id,
  created_at,
  updated_at
on public.dp_qb_subtopics
for each row
execute function private.dp_qb_subtopics_canonicalize_write();

drop trigger if exists dp_qb_variants_canonicalize_taxonomy
  on public.dp_qb_question_variants;
create trigger dp_qb_variants_canonicalize_taxonomy
before insert or update of topic_id, canonical_source_subtopic_id
on public.dp_qb_question_variants
for each row
execute function private.dp_qb_variants_canonicalize_taxonomy();

drop trigger if exists dp_qb_placements_canonicalize_taxonomy
  on public.dp_qb_question_subtopics;
create trigger dp_qb_placements_canonicalize_taxonomy
before insert or update of subtopic_id
on public.dp_qb_question_subtopics
for each row
execute function private.dp_qb_placements_canonicalize_taxonomy();

revoke all on function private.dp_qb_resolve_topic_source_id(uuid)
  from public, anon, authenticated;
revoke all on function private.dp_qb_resolve_subtopic_source_id(uuid)
  from public, anon, authenticated;
revoke all on function private.dp_qb_topics_canonicalize_write()
  from public, anon, authenticated;
revoke all on function private.dp_qb_subtopics_canonicalize_write()
  from public, anon, authenticated;
revoke all on function private.dp_qb_variants_canonicalize_taxonomy()
  from public, anon, authenticated;
revoke all on function private.dp_qb_placements_canonicalize_taxonomy()
  from public, anon, authenticated;

do $$
declare
  topic_duplicates bigint;
  subtopic_duplicates bigint;
  variant_count bigint;
  search_count bigint;
begin
  select count(*)
  into topic_duplicates
  from (
    select 1
    from public.dp_qb_topics
    group by course_id, canonical_key
    having count(*) > 1
  ) duplicates;

  select count(*)
  into subtopic_duplicates
  from (
    select 1
    from public.dp_qb_subtopics
    group by topic_id, canonical_key
    having count(*) > 1
  ) duplicates;

  select count(*) into variant_count
  from public.dp_qb_question_variants;

  select count(*) into search_count
  from public.dp_qb_question_search;

  if topic_duplicates <> 0 then
    raise exception
      'Taxonomy consolidation left % duplicate topic groups',
      topic_duplicates;
  end if;
  if subtopic_duplicates <> 0 then
    raise exception
      'Taxonomy consolidation left % duplicate subtopic groups',
      subtopic_duplicates;
  end if;
  if variant_count <> search_count then
    raise exception
      'Question/search row mismatch after taxonomy consolidation: % variants, % search rows',
      variant_count,
      search_count;
  end if;
  if exists (
    select 1
    from public.dp_qb_question_variants v
    join public.dp_qb_topics t on t.id = v.topic_id
    where v.course_id <> t.course_id
  ) then
    raise exception 'Variant/topic course mismatch after taxonomy consolidation';
  end if;
  if exists (
    select 1
    from public.dp_qb_question_variants v
    join public.dp_qb_subtopics s
      on s.id = v.canonical_source_subtopic_id
    where v.canonical_source_subtopic_id is not null
      and v.course_id <> s.course_id
  ) then
    raise exception
      'Variant/canonical-subtopic course mismatch after taxonomy consolidation';
  end if;
  if exists (
    select 1
    from public.dp_qb_question_subtopics placement
    join public.dp_qb_question_variants variant
      on variant.id = placement.variant_id
    join public.dp_qb_subtopics subtopic
      on subtopic.id = placement.subtopic_id
    where variant.course_id <> subtopic.course_id
  ) then
    raise exception 'Placement/subtopic course mismatch after taxonomy consolidation';
  end if;
end;
$$;

-- Finish the physical taxonomy cleanup by restoring source labels under a
-- boundary-safe normalizer and replacing comma-separated synthetic topics with
-- explicit many-to-many memberships. Every original source ID remains stored.

set lock_timeout = '10s';
set statement_timeout = '180s';
set constraints all deferred;

create temporary table _dp_qb_before_multi_topic_counts on commit drop as
select
  (select count(*) from public.dp_qb_topics) as topics,
  (select count(*) from public.dp_qb_subtopics) as subtopics,
  (select count(*) from public.dp_qb_questions) as questions,
  (select count(*) from public.dp_qb_question_variants) as variants,
  (select count(*) from public.dp_qb_question_subtopics) as placements,
  (select count(*) from public.dp_qb_question_search) as search_rows,
  (select count(*) from public.dp_qb_assets) as assets,
  (select count(*) from public.dp_qb_user_progress) as progress_rows,
  (select count(*) from public.dp_qb_user_saved_questions) as saved_rows,
  (select count(*) from public.dp_qb_topic_sources) as topic_sources,
  (select count(*) from public.dp_qb_subtopic_sources) as subtopic_sources;

create table public.dp_qb_topic_source_memberships (
  source_topic_id uuid not null
    references public.dp_qb_topic_sources(source_topic_id) on delete cascade,
  topic_id uuid not null
    references public.dp_qb_topics(id)
    on delete restrict deferrable initially deferred,
  membership_order integer not null default 0
    check (membership_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_topic_id, topic_id),
  unique (source_topic_id, membership_order)
);
create unique index dp_qb_topic_source_memberships_primary_unique
  on public.dp_qb_topic_source_memberships(source_topic_id)
  where is_primary;
create index dp_qb_topic_source_memberships_topic_idx
  on public.dp_qb_topic_source_memberships(topic_id, source_topic_id);

alter table public.dp_qb_subtopic_sources
  add column is_topic_only boolean not null default false;
alter table public.dp_qb_subtopic_sources
  alter column subtopic_id drop not null;

create table public.dp_qb_subtopic_source_topic_memberships (
  source_subtopic_id uuid not null
    references public.dp_qb_subtopic_sources(source_subtopic_id)
    on delete cascade,
  topic_id uuid not null
    references public.dp_qb_topics(id)
    on delete restrict deferrable initially deferred,
  membership_order integer not null default 0
    check (membership_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_subtopic_id, topic_id),
  unique (source_subtopic_id, membership_order)
);
create index dp_qb_subtopic_source_topic_memberships_topic_idx
  on public.dp_qb_subtopic_source_topic_memberships(
    topic_id,
    source_subtopic_id
  );

alter table public.dp_qb_question_variants
  add column source_topic_id uuid;
update public.dp_qb_question_variants variant
set source_topic_id = source.source_topic_id
from public.dp_qb_topic_sources source
where source.dataset_id = variant.dataset_id;

do $$
begin
  if exists (
    select 1
    from public.dp_qb_question_variants
    where source_topic_id is null
  ) then
    raise exception 'Unable to resolve a source topic for every variant';
  end if;
end;
$$;

alter table public.dp_qb_question_variants
  alter column source_topic_id set not null;
alter table public.dp_qb_question_variants
  add constraint dp_qb_variants_source_topic_id_fkey
  foreign key (source_topic_id)
  references public.dp_qb_topic_sources(source_topic_id)
  on delete restrict deferrable initially deferred;
create index dp_qb_variants_source_topic_idx
  on public.dp_qb_question_variants(source_topic_id, id);

create table public.dp_qb_variant_topics (
  variant_id uuid not null
    references public.dp_qb_question_variants(id) on delete cascade,
  topic_id uuid not null
    references public.dp_qb_topics(id)
    on delete restrict deferrable initially deferred,
  membership_order integer not null default 0
    check (membership_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (variant_id, topic_id),
  unique (variant_id, membership_order)
);
create unique index dp_qb_variant_topics_primary_unique
  on public.dp_qb_variant_topics(variant_id)
  where is_primary;
create index dp_qb_variant_topics_topic_idx
  on public.dp_qb_variant_topics(topic_id, variant_id);

create table public.dp_qb_variant_topic_only_sources (
  variant_id uuid not null
    references public.dp_qb_question_variants(id) on delete cascade,
  source_subtopic_id uuid not null
    references public.dp_qb_subtopic_sources(source_subtopic_id)
    on delete cascade,
  placement_order integer not null default 0,
  placement_difficulty integer,
  is_fallback boolean not null default false,
  fallback_reason text,
  created_by_batch_id uuid
    references public.dp_qb_import_batches(id) on delete set null,
  last_seen_batch_id uuid
    references public.dp_qb_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (variant_id, source_subtopic_id)
);
create index dp_qb_variant_topic_only_sources_source_idx
  on public.dp_qb_variant_topic_only_sources(
    source_subtopic_id,
    variant_id
  );

alter table public.dp_qb_topic_source_memberships enable row level security;
alter table public.dp_qb_subtopic_source_topic_memberships enable row level security;
alter table public.dp_qb_variant_topics enable row level security;
alter table public.dp_qb_variant_topic_only_sources enable row level security;

revoke all on public.dp_qb_topic_source_memberships
  from anon, authenticated;
revoke all on public.dp_qb_subtopic_source_topic_memberships
  from anon, authenticated;
revoke all on public.dp_qb_variant_topics
  from anon, authenticated;
revoke all on public.dp_qb_variant_topic_only_sources
  from anon, authenticated;
grant all on public.dp_qb_topic_source_memberships to service_role;
grant all on public.dp_qb_subtopic_source_topic_memberships to service_role;
grant all on public.dp_qb_variant_topics to service_role;
grant all on public.dp_qb_variant_topic_only_sources to service_role;

create or replace function private.dp_qb_canonical_taxonomy_name(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(input, ''), '\s+', ' ', 'g'),
          '^(?:(?:[a-d]\s+(?=(?:unity and diversity|form and function|interaction and interdependence|continuity and change)(?:\s|$)))|(?:(?:topic|unit|chapter|theme|option)\s+)(?:[0-9]+(?:\.[0-9]+)*|[a-z](?:\.[0-9]+)*|[ivxlcdm]+)(?:\s*[:.)\]-]\s*|\s+)|(?:[0-9]+(?:\.[0-9]+)+[a-z])\s+|(?:[0-9]+(?:\.[0-9]+)+|[a-z]\.[0-9]+(?:\.[0-9]+)*)(?:\s*[:.)\]-]\s*|\s+)|(?:[0-9]+|[a-z]|[ivxlcdm]+)\s*[:.)\]-]\s*)',
          '',
          'i'
        ),
        '&',
        ' and ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- Rebuild physical labels from preserved source labels and merge the eight
-- remaining A-D Biology theme aliases before resolving composite memberships.
create temporary table _dp_qb_source_topic_labels on commit drop as
select distinct on (source.topic_id)
  source.topic_id,
  source.course_id,
  private.dp_qb_canonical_taxonomy_name(source.source_name) as candidate_name,
  private.dp_qb_canonical_taxonomy_key(source.source_name) as candidate_key,
  source.source_name,
  source.source_sort_order
from public.dp_qb_topic_sources source
order by
  source.topic_id,
  case
    when btrim(source.source_name) =
      private.dp_qb_canonical_taxonomy_name(source.source_name)
      then 0
    else 1
  end,
  source.source_sort_order,
  source.source_topic_id;

create temporary table _dp_qb_theme_representatives on commit drop as
select distinct on (course_id, candidate_key)
  course_id,
  candidate_key,
  topic_id as canonical_topic_id
from _dp_qb_source_topic_labels
order by
  course_id,
  candidate_key,
  case when btrim(source_name) = candidate_name then 0 else 1 end,
  source_sort_order,
  topic_id;

create temporary table _dp_qb_theme_topic_map on commit drop as
select
  label.topic_id as source_topic_id,
  representative.canonical_topic_id,
  label.course_id,
  label.candidate_name,
  label.candidate_key
from _dp_qb_source_topic_labels label
join _dp_qb_theme_representatives representative
  using (course_id, candidate_key);

create temporary table _dp_qb_source_subtopic_labels on commit drop as
select distinct on (source.subtopic_id)
  source.subtopic_id,
  private.dp_qb_canonical_taxonomy_name(source.source_name) as candidate_name
from public.dp_qb_subtopic_sources source
order by
  source.subtopic_id,
  case
    when btrim(source.source_name) =
      private.dp_qb_canonical_taxonomy_name(source.source_name)
      then 0
    else 1
  end,
  source.source_sort_order,
  source.source_subtopic_id;

alter table public.dp_qb_topics
  disable trigger dp_qb_topics_canonicalize_write;
alter table public.dp_qb_subtopics
  disable trigger dp_qb_subtopics_canonicalize_write;

update public.dp_qb_question_variants variant
set topic_id = map.canonical_topic_id
from _dp_qb_theme_topic_map map
where variant.topic_id = map.source_topic_id
  and variant.topic_id <> map.canonical_topic_id;

update public.dp_qb_subtopics subtopic
set topic_id = map.canonical_topic_id,
    updated_at = now()
from _dp_qb_theme_topic_map map
where subtopic.topic_id = map.source_topic_id
  and subtopic.topic_id <> map.canonical_topic_id;

update public.dp_qb_topic_sources source
set topic_id = map.canonical_topic_id,
    updated_at = now()
from _dp_qb_theme_topic_map map
where source.topic_id = map.source_topic_id
  and source.topic_id <> map.canonical_topic_id;

update public.dp_qb_subtopic_sources source
set topic_id = map.canonical_topic_id,
    updated_at = now()
from _dp_qb_theme_topic_map map
where source.topic_id = map.source_topic_id
  and source.topic_id <> map.canonical_topic_id;

delete from public.dp_qb_topics topic
using _dp_qb_theme_topic_map map
where topic.id = map.source_topic_id
  and map.source_topic_id <> map.canonical_topic_id;

update public.dp_qb_topics topic
set name = label.candidate_name,
    updated_at = now()
from _dp_qb_source_topic_labels label
where topic.id = label.topic_id
  and topic.name is distinct from label.candidate_name;

update public.dp_qb_subtopics subtopic
set name = label.candidate_name,
    updated_at = now()
from _dp_qb_source_subtopic_labels label
where subtopic.id = label.subtopic_id
  and subtopic.name is distinct from label.candidate_name;

alter table public.dp_qb_topics
  enable trigger dp_qb_topics_canonicalize_write;
alter table public.dp_qb_subtopics
  enable trigger dp_qb_subtopics_canonicalize_write;

alter table public.dp_qb_topics
  alter column canonical_name
  set expression as (private.dp_qb_canonical_taxonomy_name(name));
alter table public.dp_qb_topics
  alter column canonical_key
  set expression as (private.dp_qb_canonical_taxonomy_key(name));
alter table public.dp_qb_subtopics
  alter column canonical_name
  set expression as (private.dp_qb_canonical_taxonomy_name(name));
alter table public.dp_qb_subtopics
  alter column canonical_key
  set expression as (private.dp_qb_canonical_taxonomy_key(name));

-- Every source topic begins with its current physical topic. Fully resolvable
-- comma-separated classifications are then replaced with deduplicated component
-- memberships in first-source order.
insert into public.dp_qb_topic_source_memberships (
  source_topic_id,
  topic_id,
  membership_order,
  is_primary
)
select source_topic_id, topic_id, 0, true
from public.dp_qb_topic_sources;

create temporary table _dp_qb_source_topic_parts on commit drop as
select
  source.source_topic_id,
  source.course_id,
  part.ordinality::integer as source_order,
  btrim(part.value) as part_name
from public.dp_qb_topic_sources source
cross join lateral unnest(string_to_array(source.source_name, ','))
  with ordinality as part(value, ordinality)
where source.source_name like '%,%';

create temporary table _dp_qb_resolved_topic_components on commit drop as
select
  part.source_topic_id,
  part.course_id,
  part.source_order,
  topic.id as topic_id
from _dp_qb_source_topic_parts part
join public.dp_qb_topics topic
  on topic.course_id = part.course_id
 and topic.canonical_key =
   private.dp_qb_canonical_taxonomy_key(part.part_name);

create temporary table _dp_qb_valid_composite_sources on commit drop as
select part.source_topic_id
from _dp_qb_source_topic_parts part
left join _dp_qb_resolved_topic_components resolved
  on resolved.source_topic_id = part.source_topic_id
 and resolved.source_order = part.source_order
group by part.source_topic_id
having count(*) > 1
   and count(*) = count(resolved.topic_id);

create temporary table _dp_qb_component_memberships on commit drop as
select
  ordered.source_topic_id,
  ordered.topic_id,
  ordered.membership_order - 1 as membership_order,
  ordered.membership_order = 1 as is_primary
from (
  select
    deduplicated.source_topic_id,
    deduplicated.topic_id,
    row_number() over (
      partition by deduplicated.source_topic_id
      order by deduplicated.first_source_order, deduplicated.topic_id
    ) as membership_order
  from (
    select
      resolved.source_topic_id,
      resolved.topic_id,
      min(resolved.source_order) as first_source_order
    from _dp_qb_resolved_topic_components resolved
    join _dp_qb_valid_composite_sources valid
      using (source_topic_id)
    group by resolved.source_topic_id, resolved.topic_id
  ) deduplicated
) ordered;

create temporary table _dp_qb_composite_physical_topics on commit drop as
select distinct source.topic_id
from public.dp_qb_topic_sources source
join _dp_qb_valid_composite_sources valid
  using (source_topic_id);

create temporary table _dp_qb_composite_source_subtopics on commit drop as
select
  source.source_subtopic_id,
  source.subtopic_id,
  source.source_topic_id
from public.dp_qb_subtopic_sources source
join _dp_qb_valid_composite_sources valid
  using (source_topic_id);

do $$
begin
  if exists (
    select 1
    from public.dp_qb_topic_sources source
    join _dp_qb_composite_physical_topics composite
      on composite.topic_id = source.topic_id
    left join _dp_qb_valid_composite_sources valid
      on valid.source_topic_id = source.source_topic_id
    where valid.source_topic_id is null
  ) then
    raise exception
      'A non-composite source alias depends on a composite physical topic';
  end if;
  if exists (
    select 1
    from public.dp_qb_subtopic_sources source
    join _dp_qb_composite_source_subtopics composite
      on composite.subtopic_id = source.subtopic_id
    left join _dp_qb_valid_composite_sources valid
      on valid.source_topic_id = source.source_topic_id
    where valid.source_topic_id is null
  ) then
    raise exception
      'A non-composite source alias depends on a composite physical subtopic';
  end if;
end;
$$;

delete from public.dp_qb_topic_source_memberships membership
using _dp_qb_valid_composite_sources valid
where membership.source_topic_id = valid.source_topic_id;

insert into public.dp_qb_topic_source_memberships (
  source_topic_id,
  topic_id,
  membership_order,
  is_primary
)
select source_topic_id, topic_id, membership_order, is_primary
from _dp_qb_component_memberships;

insert into public.dp_qb_subtopic_source_topic_memberships (
  source_subtopic_id,
  topic_id,
  membership_order
)
select
  source_subtopic.source_subtopic_id,
  membership.topic_id,
  membership.membership_order
from public.dp_qb_subtopic_sources source_subtopic
join public.dp_qb_topic_source_memberships membership
  on membership.source_topic_id = source_subtopic.source_topic_id;

insert into public.dp_qb_variant_topics (
  variant_id,
  topic_id,
  membership_order,
  is_primary
)
select
  variant.id,
  membership.topic_id,
  membership.membership_order,
  membership.is_primary
from public.dp_qb_question_variants variant
join public.dp_qb_topic_source_memberships membership
  on membership.source_topic_id = variant.source_topic_id;

insert into public.dp_qb_variant_topic_only_sources (
  variant_id,
  source_subtopic_id,
  placement_order,
  placement_difficulty,
  is_fallback,
  fallback_reason,
  created_by_batch_id,
  last_seen_batch_id
)
select
  placement.variant_id,
  source.source_subtopic_id,
  placement.placement_order,
  placement.placement_difficulty,
  placement.is_fallback,
  placement.fallback_reason,
  placement.created_by_batch_id,
  placement.last_seen_batch_id
from public.dp_qb_question_subtopics placement
join _dp_qb_composite_source_subtopics source
  on source.subtopic_id = placement.subtopic_id;

update public.dp_qb_question_variants variant
set topic_id = membership.topic_id
from public.dp_qb_topic_source_memberships membership
where membership.source_topic_id = variant.source_topic_id
  and membership.is_primary
  and variant.topic_id <> membership.topic_id;

update public.dp_qb_question_variants variant
set canonical_source_subtopic_id = null
where exists (
  select 1
  from _dp_qb_composite_source_subtopics source
  where source.subtopic_id = variant.canonical_source_subtopic_id
);

delete from public.dp_qb_question_subtopics placement
using _dp_qb_composite_source_subtopics source
where placement.subtopic_id = source.subtopic_id;

update public.dp_qb_subtopic_sources source
set subtopic_id = null,
    is_topic_only = true,
    topic_id = (
      select membership.topic_id
      from public.dp_qb_topic_source_memberships membership
      where membership.source_topic_id = source.source_topic_id
        and membership.is_primary
    ),
    updated_at = now()
where exists (
  select 1
  from _dp_qb_valid_composite_sources valid
  where valid.source_topic_id = source.source_topic_id
);

delete from public.dp_qb_subtopics subtopic
using _dp_qb_composite_source_subtopics source
where subtopic.id = source.subtopic_id;

update public.dp_qb_topic_sources source
set topic_id = membership.topic_id,
    updated_at = now()
from public.dp_qb_topic_source_memberships membership
where membership.source_topic_id = source.source_topic_id
  and membership.is_primary
  and source.topic_id <> membership.topic_id;

delete from public.dp_qb_topics topic
using _dp_qb_composite_physical_topics composite
where topic.id = composite.topic_id;

-- Fail closed unless all source and live relationships survived exactly.
do $$
declare
  before_counts record;
  expected_composite_sources bigint := 479;
  expected_topic_only_placements bigint := 914;
begin
  select * into before_counts
  from _dp_qb_before_multi_topic_counts;

  if (select count(*) from _dp_qb_valid_composite_sources)
       <> expected_composite_sources then
    raise exception
      'Expected % composite source topics, found %',
      expected_composite_sources,
      (select count(*) from _dp_qb_valid_composite_sources);
  end if;
  if (select count(*) from public.dp_qb_variant_topic_only_sources)
       <> expected_topic_only_placements then
    raise exception
      'Expected % topic-only placements, found %',
      expected_topic_only_placements,
      (select count(*) from public.dp_qb_variant_topic_only_sources);
  end if;
  if (select count(*) from public.dp_qb_questions) <> before_counts.questions
     or (select count(*) from public.dp_qb_question_variants)
          <> before_counts.variants
     or (select count(*) from public.dp_qb_question_search)
          <> before_counts.search_rows
     or (select count(*) from public.dp_qb_assets) <> before_counts.assets
     or (select count(*) from public.dp_qb_user_progress)
          <> before_counts.progress_rows
     or (select count(*) from public.dp_qb_user_saved_questions)
          <> before_counts.saved_rows
     or (select count(*) from public.dp_qb_topic_sources)
          <> before_counts.topic_sources
     or (select count(*) from public.dp_qb_subtopic_sources)
          <> before_counts.subtopic_sources then
    raise exception 'A protected Question Bank count changed';
  end if;
  if exists (
    select 1
    from public.dp_qb_question_variants variant
    where not exists (
      select 1
      from public.dp_qb_variant_topics membership
      where membership.variant_id = variant.id
    )
  ) then
    raise exception 'A variant has no topic membership';
  end if;
  if exists (
    select 1
    from public.dp_qb_question_variants variant
    left join public.dp_qb_variant_topics membership
      on membership.variant_id = variant.id
     and membership.is_primary
    where membership.topic_id is distinct from variant.topic_id
  ) then
    raise exception 'A variant primary membership differs from topic_id';
  end if;
  if exists (
    select 1
    from public.dp_qb_topic_sources source
    left join public.dp_qb_topic_source_memberships membership
      on membership.source_topic_id = source.source_topic_id
     and membership.is_primary
    where membership.topic_id is distinct from source.topic_id
  ) then
    raise exception 'A source topic primary membership differs from topic_id';
  end if;
  if exists (
    select 1
    from public.dp_qb_topic_sources source
    left join public.dp_qb_topics topic on topic.id = source.topic_id
    where topic.id is null
  ) then
    raise exception 'A topic source alias is orphaned';
  end if;
  if exists (
    select 1
    from public.dp_qb_subtopic_sources source
    left join public.dp_qb_subtopics subtopic
      on subtopic.id = source.subtopic_id
    where not source.is_topic_only and subtopic.id is null
  ) then
    raise exception 'A physical subtopic source alias is orphaned';
  end if;
  if exists (
    select 1
    from public.dp_qb_subtopic_sources
    where is_topic_only and subtopic_id is not null
  ) then
    raise exception 'A topic-only source alias still has a physical subtopic';
  end if;
  if exists (
    select 1
    from public.dp_qb_topics topic
    where topic.name like '%,%'
      and not exists (
        select 1
        from unnest(string_to_array(topic.name, ',')) part
        where not exists (
          select 1
          from public.dp_qb_topics component
          where component.course_id = topic.course_id
            and component.canonical_key =
              private.dp_qb_canonical_taxonomy_key(btrim(part))
        )
      )
  ) then
    raise exception 'A resolvable composite physical topic remains';
  end if;
  if exists (
    select 1
    from public.dp_qb_topics
    group by course_id, canonical_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate physical topic groups remain';
  end if;
  if exists (
    select 1
    from public.dp_qb_subtopics
    group by topic_id, canonical_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate physical subtopic groups remain';
  end if;
  if exists (
    select 1 from public.dp_qb_topics where name <> canonical_name
  ) or exists (
    select 1 from public.dp_qb_subtopics where name <> canonical_name
  ) then
    raise exception 'A physical taxonomy label is not canonical';
  end if;
end;
$$;

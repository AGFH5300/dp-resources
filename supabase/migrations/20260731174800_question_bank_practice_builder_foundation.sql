-- Additive foundation for the cross-subject Question Bank practice builder.
--
-- This migration creates no concepts, mappings, practice sets or sessions. It
-- does not update imported Question Bank content. Student-facing concepts are a
-- reviewed layer over the existing source-preserving taxonomy.

set lock_timeout = '10s';
set statement_timeout = '180s';

create table public.dp_qb_concept_groups (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null
    references public.dp_qb_subjects(id) on delete restrict,
  parent_group_id uuid
    references public.dp_qb_concept_groups(id) on delete restrict,
  slug text not null,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'archived')),
  mapping_version integer not null default 1
    check (mapping_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, slug)
);

create index dp_qb_concept_groups_subject_sort_idx
  on public.dp_qb_concept_groups(subject_id, sort_order, name, id);
create index dp_qb_concept_groups_parent_idx
  on public.dp_qb_concept_groups(parent_group_id, sort_order, id);

create table public.dp_qb_concepts (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null
    references public.dp_qb_subjects(id) on delete restrict,
  group_id uuid
    references public.dp_qb_concept_groups(id) on delete restrict,
  slug text not null,
  name text not null,
  description text not null default '',
  aliases text[] not null default array[]::text[],
  sort_order integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'archived')),
  mapping_version integer not null default 1
    check (mapping_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, slug)
);

create index dp_qb_concepts_subject_status_sort_idx
  on public.dp_qb_concepts(subject_id, status, sort_order, name, id);
create index dp_qb_concepts_group_sort_idx
  on public.dp_qb_concepts(group_id, sort_order, name, id);
create index dp_qb_concepts_aliases_idx
  on public.dp_qb_concepts using gin(aliases);

create table public.dp_qb_concept_topic_memberships (
  concept_id uuid not null
    references public.dp_qb_concepts(id) on delete cascade,
  topic_id uuid not null
    references public.dp_qb_topics(id) on delete restrict,
  mapping_source text not null default 'curated'
    check (mapping_source in ('curated', 'reviewed_suggestion')),
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (concept_id, topic_id)
);

create index dp_qb_concept_topic_memberships_topic_idx
  on public.dp_qb_concept_topic_memberships(topic_id, concept_id);

create table public.dp_qb_concept_subtopic_memberships (
  concept_id uuid not null
    references public.dp_qb_concepts(id) on delete cascade,
  subtopic_id uuid not null
    references public.dp_qb_subtopics(id) on delete restrict,
  mapping_source text not null default 'curated'
    check (mapping_source in ('curated', 'reviewed_suggestion')),
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (concept_id, subtopic_id)
);

create index dp_qb_concept_subtopic_memberships_subtopic_idx
  on public.dp_qb_concept_subtopic_memberships(subtopic_id, concept_id);

create table public.dp_qb_concept_variant_overrides (
  concept_id uuid not null
    references public.dp_qb_concepts(id) on delete cascade,
  variant_id uuid not null
    references public.dp_qb_question_variants(id) on delete cascade,
  action text not null check (action in ('include', 'exclude')),
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (concept_id, variant_id)
);

create index dp_qb_concept_variant_overrides_variant_idx
  on public.dp_qb_concept_variant_overrides(variant_id, concept_id);

create table public.dp_qb_practice_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  name text,
  state text not null default 'draft'
    check (state in ('draft', 'saved', 'archived')),
  schema_version integer not null default 1
    check (schema_version > 0),
  revision integer not null default 1
    check (revision > 0),
  ordering_mode text not null default 'interleaved'
    check (
      ordering_mode in (
        'mixed',
        'grouped',
        'interleaved',
        'easier_to_harder',
        'source_order'
      )
    ),
  default_filters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(default_filters) = 'object'),
  requested_total integer
    check (requested_total is null or requested_total between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dp_qb_practice_sets_user_state_updated_idx
  on public.dp_qb_practice_sets(user_id, state, updated_at desc, id);

create table public.dp_qb_practice_set_blocks (
  id uuid primary key default gen_random_uuid(),
  practice_set_id uuid not null
    references public.dp_qb_practice_sets(id) on delete cascade,
  selection_type text not null
    check (selection_type in ('concept', 'course')),
  concept_id uuid
    references public.dp_qb_concepts(id) on delete restrict,
  course_id uuid
    references public.dp_qb_courses(id) on delete restrict,
  requested_question_count integer not null
    check (requested_question_count between 1 and 200),
  filters_override jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filters_override) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      selection_type = 'concept'
      and concept_id is not null
      and course_id is null
    )
    or (
      selection_type = 'course'
      and course_id is not null
      and concept_id is null
    )
  ),
  unique (practice_set_id, sort_order)
);

create index dp_qb_practice_set_blocks_set_idx
  on public.dp_qb_practice_set_blocks(practice_set_id, sort_order, id);
create index dp_qb_practice_set_blocks_concept_idx
  on public.dp_qb_practice_set_blocks(concept_id, practice_set_id)
  where concept_id is not null;
create index dp_qb_practice_set_blocks_course_idx
  on public.dp_qb_practice_set_blocks(course_id, practice_set_id)
  where course_id is not null;

create table public.dp_qb_practice_set_block_courses (
  block_id uuid not null
    references public.dp_qb_practice_set_blocks(id) on delete cascade,
  course_id uuid not null
    references public.dp_qb_courses(id) on delete restrict,
  priority integer not null default 0
    check (priority >= 0),
  created_at timestamptz not null default now(),
  primary key (block_id, course_id),
  unique (block_id, priority)
);

create index dp_qb_practice_set_block_courses_course_idx
  on public.dp_qb_practice_set_block_courses(course_id, block_id);

create table public.dp_qb_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  practice_set_id uuid
    references public.dp_qb_practice_sets(id) on delete set null,
  schema_version integer not null default 1
    check (schema_version > 0),
  configuration_snapshot jsonb not null
    check (jsonb_typeof(configuration_snapshot) = 'object'),
  generation_seed text not null
    check (char_length(generation_seed) between 1 and 128),
  configuration_hash text not null
    check (configuration_hash ~ '^[0-9a-f]{64}$'),
  ordering_mode text not null
    check (
      ordering_mode in (
        'mixed',
        'grouped',
        'interleaved',
        'easier_to_harder',
        'source_order'
      )
    ),
  status text not null default 'generated'
    check (status in ('generated', 'in_progress', 'completed', 'abandoned')),
  requested_count integer not null
    check (requested_count between 1 and 200),
  generated_count integer not null
    check (generated_count between 0 and 200),
  current_position integer not null default 0
    check (current_position >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (generated_count <= requested_count)
);

create index dp_qb_practice_sessions_user_status_created_idx
  on public.dp_qb_practice_sessions(user_id, status, created_at desc, id);
create index dp_qb_practice_sessions_set_idx
  on public.dp_qb_practice_sessions(practice_set_id, created_at desc, id)
  where practice_set_id is not null;

create table public.dp_qb_practice_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.dp_qb_practice_sessions(id) on delete cascade,
  position integer not null check (position >= 0),
  primary_block_id uuid
    references public.dp_qb_practice_set_blocks(id) on delete set null,
  primary_block_snapshot jsonb not null
    check (jsonb_typeof(primary_block_snapshot) = 'object'),
  question_id uuid not null
    references public.dp_qb_questions(id) on delete restrict,
  variant_id uuid not null
    references public.dp_qb_question_variants(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'viewed', 'completed', 'skipped')),
  first_viewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, position),
  unique (session_id, question_id)
);

create index dp_qb_practice_session_items_session_status_idx
  on public.dp_qb_practice_session_items(session_id, status, position, id);
create index dp_qb_practice_session_items_variant_idx
  on public.dp_qb_practice_session_items(variant_id, session_id);

create table public.dp_qb_practice_session_item_matches (
  id uuid primary key default gen_random_uuid(),
  session_item_id uuid not null
    references public.dp_qb_practice_session_items(id) on delete cascade,
  match_key text not null,
  block_id uuid
    references public.dp_qb_practice_set_blocks(id) on delete set null,
  concept_id uuid
    references public.dp_qb_concepts(id) on delete set null,
  match_snapshot jsonb not null
    check (jsonb_typeof(match_snapshot) = 'object'),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_item_id, match_key)
);

create unique index dp_qb_practice_item_matches_primary_unique
  on public.dp_qb_practice_session_item_matches(session_item_id)
  where is_primary;
create index dp_qb_practice_item_matches_block_idx
  on public.dp_qb_practice_session_item_matches(block_id, session_item_id)
  where block_id is not null;
create index dp_qb_practice_item_matches_concept_idx
  on public.dp_qb_practice_session_item_matches(concept_id, session_item_id)
  where concept_id is not null;

create or replace function private.dp_qb_practice_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.dp_qb_validate_concept_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_group_id is not null and not exists (
    select 1
    from public.dp_qb_concept_groups parent_group
    where parent_group.id = new.parent_group_id
      and parent_group.subject_id = new.subject_id
  ) then
    raise exception 'Concept group parent must belong to the same subject'
      using errcode = '23514';
  end if;
  if new.parent_group_id = new.id then
    raise exception 'Concept group cannot be its own parent'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.dp_qb_validate_concept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id is not null and not exists (
    select 1
    from public.dp_qb_concept_groups concept_group
    where concept_group.id = new.group_id
      and concept_group.subject_id = new.subject_id
  ) then
    raise exception 'Concept group must belong to the same subject'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.dp_qb_validate_concept_topic_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.dp_qb_concepts concept
    join public.dp_qb_topics topic on topic.id = new.topic_id
    join public.dp_qb_courses course on course.id = topic.course_id
    where concept.id = new.concept_id
      and concept.subject_id = course.subject_id
  ) then
    raise exception 'Concept and topic must belong to the same subject'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.dp_qb_validate_concept_subtopic_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
 as $$
begin
  if not exists (
    select 1
    from public.dp_qb_concepts concept
    join public.dp_qb_subtopics subtopic on subtopic.id = new.subtopic_id
    join public.dp_qb_courses course on course.id = subtopic.course_id
    where concept.id = new.concept_id
      and concept.subject_id = course.subject_id
  ) then
    raise exception 'Concept and subtopic must belong to the same subject'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.dp_qb_validate_concept_variant_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.dp_qb_concepts concept
    join public.dp_qb_question_variants variant on variant.id = new.variant_id
    join public.dp_qb_courses course on course.id = variant.course_id
    where concept.id = new.concept_id
      and concept.subject_id = course.subject_id
  ) then
    raise exception 'Concept and variant must belong to the same subject'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.dp_qb_validate_practice_set_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  block_count integer;
begin
  select count(*)
  into block_count
  from public.dp_qb_practice_set_blocks block
  where block.practice_set_id = new.practice_set_id
    and (tg_op = 'INSERT' or block.id <> new.id);

  if block_count >= 20 then
    raise exception 'A practice set can contain at most 20 blocks'
      using errcode = '23514';
  end if;

  if new.selection_type = 'concept' and not exists (
    select 1
    from public.dp_qb_concepts concept
    where concept.id = new.concept_id
      and concept.status <> 'archived'
  ) then
    raise exception 'Concept block must reference an available concept'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.dp_qb_validate_practice_block_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer;
begin
  if not exists (
    select 1
    from public.dp_qb_practice_set_blocks block
    join public.dp_qb_concepts concept on concept.id = block.concept_id
    join public.dp_qb_courses course on course.id = new.course_id
    where block.id = new.block_id
      and block.selection_type = 'concept'
      and concept.subject_id = course.subject_id
  ) then
    raise exception 'Selected course must match the concept block subject'
      using errcode = '23514';
  end if;

  select count(*)
  into selected_count
  from public.dp_qb_practice_set_block_courses selected
  where selected.block_id = new.block_id
    and (tg_op = 'INSERT' or selected.course_id <> new.course_id);

  if selected_count >= 10 then
    raise exception 'A concept block can select at most 10 courses'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.dp_qb_validate_session_item_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.dp_qb_question_variants variant
    where variant.id = new.variant_id
      and variant.question_id = new.question_id
      and variant.render_status = 'ready'
  ) then
    raise exception 'Session item variant must be ready and belong to its question'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger dp_qb_concept_groups_validate
before insert or update on public.dp_qb_concept_groups
for each row execute function private.dp_qb_validate_concept_group();
create trigger dp_qb_concepts_validate
before insert or update on public.dp_qb_concepts
for each row execute function private.dp_qb_validate_concept();
create trigger dp_qb_concept_topics_validate
before insert or update on public.dp_qb_concept_topic_memberships
for each row execute function private.dp_qb_validate_concept_topic_membership();
create trigger dp_qb_concept_subtopics_validate
before insert or update on public.dp_qb_concept_subtopic_memberships
for each row execute function private.dp_qb_validate_concept_subtopic_membership();
create trigger dp_qb_concept_variants_validate
before insert or update on public.dp_qb_concept_variant_overrides
for each row execute function private.dp_qb_validate_concept_variant_override();
create trigger dp_qb_practice_blocks_validate
before insert or update on public.dp_qb_practice_set_blocks
for each row execute function private.dp_qb_validate_practice_set_block();
create trigger dp_qb_practice_block_courses_validate
before insert or update on public.dp_qb_practice_set_block_courses
for each row execute function private.dp_qb_validate_practice_block_course();
create trigger dp_qb_practice_session_items_validate
before insert or update on public.dp_qb_practice_session_items
for each row execute function private.dp_qb_validate_session_item_variant();

create trigger dp_qb_concept_groups_touch_updated_at
before update on public.dp_qb_concept_groups
for each row execute function private.dp_qb_practice_touch_updated_at();
create trigger dp_qb_concepts_touch_updated_at
before update on public.dp_qb_concepts
for each row execute function private.dp_qb_practice_touch_updated_at();
create trigger dp_qb_concept_topics_touch_updated_at
before update on public.dp_qb_concept_topic_memberships
for each row execute function private.dp_qb_practice_touch_updated_at();
create trigger dp_qb_concept_subtopics_touch_updated_at
before update on public.dp_qb_concept_subtopic_memberships
for each row execute function private.dp_qb_practice_touch_updated_at();
create trigger dp_qb_concept_variants_touch_updated_at
before update on public.dp_qb_concept_variant_overrides
for each row execute function private.dp_qb_practice_touch_updated_at();
create trigger dp_qb_practice_sets_touch_updated_at
before update on public.dp_qb_practice_sets
for each row execute function private.dp_qb_practice_touch_updated_at();
create trigger dp_qb_practice_blocks_touch_updated_at
before update on public.dp_qb_practice_set_blocks
for each row execute function private.dp_qb_practice_touch_updated_at();
create trigger dp_qb_practice_sessions_touch_updated_at
before update on public.dp_qb_practice_sessions
for each row execute function private.dp_qb_practice_touch_updated_at();
create trigger dp_qb_practice_session_items_touch_updated_at
before update on public.dp_qb_practice_session_items
for each row execute function private.dp_qb_practice_touch_updated_at();

alter table public.dp_qb_concept_groups enable row level security;
alter table public.dp_qb_concepts enable row level security;
alter table public.dp_qb_concept_topic_memberships enable row level security;
alter table public.dp_qb_concept_subtopic_memberships enable row level security;
alter table public.dp_qb_concept_variant_overrides enable row level security;
alter table public.dp_qb_practice_sets enable row level security;
alter table public.dp_qb_practice_set_blocks enable row level security;
alter table public.dp_qb_practice_set_block_courses enable row level security;
alter table public.dp_qb_practice_sessions enable row level security;
alter table public.dp_qb_practice_session_items enable row level security;
alter table public.dp_qb_practice_session_item_matches enable row level security;

create policy dp_qb_concept_groups_member_read
on public.dp_qb_concept_groups for select
to authenticated
using (private.dp_qb_has_access() and status = 'approved');
create policy dp_qb_concepts_member_read
on public.dp_qb_concepts for select
to authenticated
using (private.dp_qb_has_access() and status = 'approved');
create policy dp_qb_concept_topics_member_read
on public.dp_qb_concept_topic_memberships for select
to authenticated
using (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_concepts concept
    where concept.id = concept_id
      and concept.status = 'approved'
  )
);
create policy dp_qb_concept_subtopics_member_read
on public.dp_qb_concept_subtopic_memberships for select
to authenticated
using (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_concepts concept
    where concept.id = concept_id
      and concept.status = 'approved'
  )
);
create policy dp_qb_concept_variants_member_read
on public.dp_qb_concept_variant_overrides for select
to authenticated
using (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_concepts concept
    where concept.id = concept_id
      and concept.status = 'approved'
  )
);

create policy dp_qb_practice_sets_owner_select
on public.dp_qb_practice_sets for select
to authenticated
using (private.dp_qb_has_access() and user_id = (select auth.uid()));
create policy dp_qb_practice_sets_owner_insert
on public.dp_qb_practice_sets for insert
to authenticated
with check (private.dp_qb_has_access() and user_id = (select auth.uid()));
create policy dp_qb_practice_sets_owner_update
on public.dp_qb_practice_sets for update
to authenticated
using (private.dp_qb_has_access() and user_id = (select auth.uid()))
with check (private.dp_qb_has_access() and user_id = (select auth.uid()));
create policy dp_qb_practice_sets_owner_delete
on public.dp_qb_practice_sets for delete
to authenticated
using (private.dp_qb_has_access() and user_id = (select auth.uid()));

create policy dp_qb_practice_blocks_owner_all
on public.dp_qb_practice_set_blocks for all
to authenticated
using (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_practice_sets practice_set
    where practice_set.id = practice_set_id
      and practice_set.user_id = (select auth.uid())
  )
)
with check (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_practice_sets practice_set
    where practice_set.id = practice_set_id
      and practice_set.user_id = (select auth.uid())
  )
);

create policy dp_qb_practice_block_courses_owner_all
on public.dp_qb_practice_set_block_courses for all
to authenticated
using (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_practice_set_blocks block
    join public.dp_qb_practice_sets practice_set
      on practice_set.id = block.practice_set_id
    where block.id = block_id
      and practice_set.user_id = (select auth.uid())
  )
)
with check (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_practice_set_blocks block
    join public.dp_qb_practice_sets practice_set
      on practice_set.id = block.practice_set_id
    where block.id = block_id
      and practice_set.user_id = (select auth.uid())
  )
);

create policy dp_qb_practice_sessions_owner_read
on public.dp_qb_practice_sessions for select
to authenticated
using (private.dp_qb_has_access() and user_id = (select auth.uid()));
create policy dp_qb_practice_session_items_owner_read
on public.dp_qb_practice_session_items for select
to authenticated
using (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_practice_sessions session
    where session.id = session_id
      and session.user_id = (select auth.uid())
  )
);
create policy dp_qb_practice_item_matches_owner_read
on public.dp_qb_practice_session_item_matches for select
to authenticated
using (
  private.dp_qb_has_access()
  and exists (
    select 1
    from public.dp_qb_practice_session_items item
    join public.dp_qb_practice_sessions session
      on session.id = item.session_id
    where item.id = session_item_id
      and session.user_id = (select auth.uid())
  )
);

revoke all on public.dp_qb_concept_groups from anon, authenticated;
revoke all on public.dp_qb_concepts from anon, authenticated;
revoke all on public.dp_qb_concept_topic_memberships from anon, authenticated;
revoke all on public.dp_qb_concept_subtopic_memberships from anon, authenticated;
revoke all on public.dp_qb_concept_variant_overrides from anon, authenticated;
revoke all on public.dp_qb_practice_sets from anon, authenticated;
revoke all on public.dp_qb_practice_set_blocks from anon, authenticated;
revoke all on public.dp_qb_practice_set_block_courses from anon, authenticated;
revoke all on public.dp_qb_practice_sessions from anon, authenticated;
revoke all on public.dp_qb_practice_session_items from anon, authenticated;
revoke all on public.dp_qb_practice_session_item_matches from anon, authenticated;

grant select on public.dp_qb_concept_groups to authenticated;
grant select on public.dp_qb_concepts to authenticated;
grant select on public.dp_qb_concept_topic_memberships to authenticated;
grant select on public.dp_qb_concept_subtopic_memberships to authenticated;
grant select on public.dp_qb_concept_variant_overrides to authenticated;
grant select, insert, update, delete on public.dp_qb_practice_sets to authenticated;
grant select, insert, update, delete on public.dp_qb_practice_set_blocks to authenticated;
grant select, insert, update, delete on public.dp_qb_practice_set_block_courses to authenticated;
grant select on public.dp_qb_practice_sessions to authenticated;
grant select on public.dp_qb_practice_session_items to authenticated;
grant select on public.dp_qb_practice_session_item_matches to authenticated;

grant all on public.dp_qb_concept_groups to service_role;
grant all on public.dp_qb_concepts to service_role;
grant all on public.dp_qb_concept_topic_memberships to service_role;
grant all on public.dp_qb_concept_subtopic_memberships to service_role;
grant all on public.dp_qb_concept_variant_overrides to service_role;
grant all on public.dp_qb_practice_sets to service_role;
grant all on public.dp_qb_practice_set_blocks to service_role;
grant all on public.dp_qb_practice_set_block_courses to service_role;
grant all on public.dp_qb_practice_sessions to service_role;
grant all on public.dp_qb_practice_session_items to service_role;
grant all on public.dp_qb_practice_session_item_matches to service_role;

revoke all on function private.dp_qb_practice_touch_updated_at() from public;
revoke all on function private.dp_qb_validate_concept_group() from public;
revoke all on function private.dp_qb_validate_concept() from public;
revoke all on function private.dp_qb_validate_concept_topic_membership() from public;
revoke all on function private.dp_qb_validate_concept_subtopic_membership() from public;
revoke all on function private.dp_qb_validate_concept_variant_override() from public;
revoke all on function private.dp_qb_validate_practice_set_block() from public;
revoke all on function private.dp_qb_validate_practice_block_course() from public;
revoke all on function private.dp_qb_validate_session_item_variant() from public;

comment on table public.dp_qb_concepts is
  'Reviewed student-facing concepts layered over imported Question Bank taxonomy.';
comment on table public.dp_qb_concept_topic_memberships is
  'Explicit reviewed concept-to-topic mappings; canonical-name equality alone is insufficient.';
comment on table public.dp_qb_concept_subtopic_memberships is
  'Explicit reviewed concept-to-subtopic mappings across selected courses.';
comment on table public.dp_qb_practice_set_blocks is
  'Per-set content blocks; every concept block independently selects its allowed courses.';
comment on table public.dp_qb_practice_sessions is
  'Immutable generated queue header with a complete configuration snapshot and seed.';
comment on table public.dp_qb_practice_session_items is
  'Deduplicated fixed session queue; one row per unique question core.';

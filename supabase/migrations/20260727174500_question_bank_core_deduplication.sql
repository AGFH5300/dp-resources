-- Consolidate exact pre-existing Question Bank core duplicates and prevent
-- future imports from creating a second core for identical audited content.

create temporary table dp_qb_duplicate_core_map on commit drop as
with ranked as (
  select
    id,
    content_hash,
    first_value(id) over (
      partition by content_hash
      order by
        case when source_status like '%_ready' then 0 else 1 end,
        created_at,
        id
    ) as canonical_id
  from public.dp_qb_questions
)
select canonical_id, id as duplicate_id
from ranked
where id <> canonical_id;

do $$
begin
  if exists (
    select 1
    from dp_qb_duplicate_core_map map
    join public.dp_qb_questions canonical on canonical.id = map.canonical_id
    join public.dp_qb_questions duplicate on duplicate.id = map.duplicate_id
    where canonical.reference is distinct from duplicate.reference
       or canonical.content is distinct from duplicate.content
       or canonical.mark_scheme is distinct from duplicate.mark_scheme
       or canonical.examiner_report is distinct from duplicate.examiner_report
       or canonical.maximum_mark is distinct from duplicate.maximum_mark
  ) then
    raise exception 'Question core deduplication stopped: a content hash maps to different content.';
  end if;

  if exists (
    select 1
    from dp_qb_duplicate_core_map map
    join public.dp_qb_question_variants duplicate
      on duplicate.question_id = map.duplicate_id
    join public.dp_qb_question_variants canonical
      on canonical.question_id = map.canonical_id
     and canonical.dataset_id = duplicate.dataset_id
     and canonical.source_index = duplicate.source_index
     and canonical.source_occurrence = duplicate.source_occurrence
  ) then
    raise exception 'Question core deduplication stopped: variant collisions would be created.';
  end if;

  if exists (
    select 1
    from dp_qb_duplicate_core_map map
    join public.dp_qb_user_progress duplicate
      on duplicate.question_id = map.duplicate_id
    join public.dp_qb_user_progress canonical
      on canonical.question_id = map.canonical_id
     and canonical.user_id = duplicate.user_id
  ) then
    raise exception 'Question core deduplication stopped: user progress collisions would be created.';
  end if;

  if exists (
    select 1
    from dp_qb_duplicate_core_map map
    join public.dp_qb_user_saved_questions duplicate
      on duplicate.question_id = map.duplicate_id
    join public.dp_qb_user_saved_questions canonical
      on canonical.question_id = map.canonical_id
     and canonical.user_id = duplicate.user_id
  ) then
    raise exception 'Question core deduplication stopped: saved-question collisions would be created.';
  end if;
end
$$;

with members as (
  select canonical_id, canonical_id as member_id
  from dp_qb_duplicate_core_map
  union
  select canonical_id, duplicate_id
  from dp_qb_duplicate_core_map
), histories as (
  select
    members.canonical_id,
    jsonb_agg(
      jsonb_build_object(
        'questionCoreId', question.id,
        'reference', question.reference,
        'sourceStatus', question.source_status,
        'sourceMetadata', question.source_metadata,
        'createdByBatchId', question.created_by_batch_id,
        'lastSeenBatchId', question.last_seen_batch_id,
        'createdAt', question.created_at
      )
      order by question.created_at, question.id
    ) as history
  from members
  join public.dp_qb_questions question on question.id = members.member_id
  group by members.canonical_id
)
update public.dp_qb_questions canonical
set source_metadata = jsonb_set(
      coalesce(canonical.source_metadata, '{}'::jsonb),
      '{deduplicatedQuestionCoreSources}',
      histories.history,
      true
    ),
    updated_at = now()
from histories
where canonical.id = histories.canonical_id;

update public.dp_qb_question_variants child
set question_id = map.canonical_id,
    updated_at = now()
from dp_qb_duplicate_core_map map
where child.question_id = map.duplicate_id;

update public.dp_qb_user_progress child
set question_id = map.canonical_id,
    updated_at = now()
from dp_qb_duplicate_core_map map
where child.question_id = map.duplicate_id;

update public.dp_qb_user_saved_questions child
set question_id = map.canonical_id
from dp_qb_duplicate_core_map map
where child.question_id = map.duplicate_id;

update public.dp_qb_question_sources child
set question_id = map.canonical_id,
    updated_at = now()
from dp_qb_duplicate_core_map map
where child.question_id = map.duplicate_id;

update public.dp_qb_asset_sources child
set source_question_id = map.canonical_id
from dp_qb_duplicate_core_map map
where child.source_question_id = map.duplicate_id;

delete from public.dp_qb_questions question
using dp_qb_duplicate_core_map map
where question.id = map.duplicate_id;

do $$
begin
  if exists (
    select 1
    from public.dp_qb_questions
    group by content_hash
    having count(*) > 1
  ) then
    raise exception 'Question core deduplication verification failed.';
  end if;
end
$$;

create unique index if not exists dp_qb_questions_content_hash_unique_idx
  on public.dp_qb_questions (content_hash);

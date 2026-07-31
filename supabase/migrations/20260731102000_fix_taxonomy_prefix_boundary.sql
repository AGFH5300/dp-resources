-- Require a real boundary after taxonomy prefixes so ordinary words such as
-- UNITED are never reinterpreted as "Unit E" during a second normalization.

set lock_timeout = '10s';
set statement_timeout = '120s';

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
          '^(?:(?:(?:topic|unit|chapter|theme|option)\s*)(?:[0-9]+(?:\.[0-9]+)*|[a-z](?:\.[0-9]+)*|[ivxlcdm]+)(?:\s*[:.)\]-]\s*|\s+)|(?:[0-9]+(?:\.[0-9]+)+|[a-z]\.[0-9]+(?:\.[0-9]+)*)(?:\s*[:.)\]-]\s*|\s+)|(?:[0-9]+|[a-z]|[ivxlcdm]+)\s*[:.)\]-]\s*)',
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

-- PostgreSQL stores generated values. Resetting each expression forces a full,
-- transactional recomputation under the corrected immutable function.
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

do $$
declare
  topic_duplicates bigint;
  subtopic_duplicates bigint;
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

  if topic_duplicates <> 0 then
    raise exception
      'Prefix-boundary repair produced % duplicate topic groups',
      topic_duplicates;
  end if;
  if subtopic_duplicates <> 0 then
    raise exception
      'Prefix-boundary repair produced % duplicate subtopic groups',
      subtopic_duplicates;
  end if;
  if exists (
    select 1
    from public.dp_qb_topics
    where name <> canonical_name
  ) then
    raise exception 'Topic names are not fully canonical after prefix-boundary repair';
  end if;
  if exists (
    select 1
    from public.dp_qb_subtopics
    where name <> canonical_name
  ) then
    raise exception 'Subtopic names are not fully canonical after prefix-boundary repair';
  end if;
  if exists (
    select 1
    from public.dp_qb_topic_sources source
    left join public.dp_qb_topics topic on topic.id = source.topic_id
    where topic.id is null
       or private.dp_qb_resolve_topic_source_id(source.source_topic_id)
          <> source.topic_id
  ) then
    raise exception 'Topic provenance mapping failed after prefix-boundary repair';
  end if;
  if exists (
    select 1
    from public.dp_qb_subtopic_sources source
    left join public.dp_qb_subtopics subtopic
      on subtopic.id = source.subtopic_id
    where subtopic.id is null
       or private.dp_qb_resolve_subtopic_source_id(source.source_subtopic_id)
          <> source.subtopic_id
  ) then
    raise exception 'Subtopic provenance mapping failed after prefix-boundary repair';
  end if;
end;
$$;

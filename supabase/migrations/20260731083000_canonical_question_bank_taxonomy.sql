-- Preserve provider/dataset taxonomy rows while exposing one stable logical label.
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
          '^(?:(?:(?:topic|unit|chapter|theme|option)\s*)(?:[0-9]+(?:\.[0-9]+)*|[a-z](?:\.[0-9]+)*|[ivxlcdm]+)\s*[:.)\]-]?\s*|(?:[0-9]+(?:\.[0-9]+)+|[a-z]\.[0-9]+(?:\.[0-9]+)*)\s*[:.)\]-]?\s*|(?:[0-9]+|[a-z]|[ivxlcdm]+)\s*[:.)\]-]\s*)',
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

create or replace function private.dp_qb_canonical_taxonomy_key(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    btrim(
      regexp_replace(
        regexp_replace(
          private.dp_qb_canonical_taxonomy_name(input),
          '[''’]',
          '',
          'g'
        ),
        '[^[:alnum:]]+',
        ' ',
        'g'
      )
    )
  );
$$;

alter table public.dp_qb_topics
  add column if not exists canonical_name text generated always as (
    private.dp_qb_canonical_taxonomy_name(name)
  ) stored,
  add column if not exists canonical_key text generated always as (
    private.dp_qb_canonical_taxonomy_key(name)
  ) stored;

alter table public.dp_qb_subtopics
  add column if not exists canonical_name text generated always as (
    private.dp_qb_canonical_taxonomy_name(name)
  ) stored,
  add column if not exists canonical_key text generated always as (
    private.dp_qb_canonical_taxonomy_key(name)
  ) stored;

comment on column public.dp_qb_topics.canonical_name is
  'Prefix-free display label for equivalent dataset-bound topics.';
comment on column public.dp_qb_topics.canonical_key is
  'Case/punctuation-insensitive logical topic key within a course.';
comment on column public.dp_qb_subtopics.canonical_name is
  'Prefix-free display label for equivalent dataset-bound subtopics.';
comment on column public.dp_qb_subtopics.canonical_key is
  'Case/punctuation-insensitive logical subtopic key within a topic group.';

create index if not exists dp_qb_topics_course_canonical_key_idx
  on public.dp_qb_topics (course_id, canonical_key, sort_order, id);
create index if not exists dp_qb_subtopics_course_canonical_key_idx
  on public.dp_qb_subtopics (course_id, canonical_key, topic_id, sort_order, id);

do $audit$
begin
  if exists (select 1 from public.dp_qb_topics where canonical_key = '') then
    raise exception 'Question-bank topic canonicalization produced an empty key';
  end if;
  if exists (select 1 from public.dp_qb_subtopics where canonical_key = '') then
    raise exception 'Question-bank subtopic canonicalization produced an empty key';
  end if;
end
$audit$;

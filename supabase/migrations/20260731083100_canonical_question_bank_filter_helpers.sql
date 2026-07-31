create or replace function private.dp_qb_variant_canonical_subtopics(p_variant_id uuid)
returns text[]
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce(
    array_agg(grouped.name order by grouped.placement_order, grouped.name),
    array[]::text[]
  )
  from (
    select
      subtopic.canonical_key,
      min(subtopic.canonical_name) as name,
      min(placement.placement_order) as placement_order
    from public.dp_qb_question_subtopics placement
    join public.dp_qb_subtopics subtopic on subtopic.id = placement.subtopic_id
    where placement.variant_id = p_variant_id
    group by subtopic.canonical_key
  ) grouped;
$$;

create or replace function private.dp_qb_variant_has_canonical_subtopic(
  p_variant_id uuid,
  p_subtopic_key text,
  p_topic_key text
)
returns boolean
language sql
stable
parallel safe
set search_path = ''
as $$
  select exists (
    select 1
    from public.dp_qb_question_subtopics placement
    join public.dp_qb_subtopics subtopic on subtopic.id = placement.subtopic_id
    join public.dp_qb_topics topic on topic.id = subtopic.topic_id
    where placement.variant_id = p_variant_id
      and subtopic.canonical_key = p_subtopic_key
      and topic.canonical_key = p_topic_key
  );
$$;

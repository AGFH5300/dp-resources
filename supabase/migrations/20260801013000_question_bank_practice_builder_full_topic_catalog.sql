-- Expose every render-ready Question Bank subject and source topic in the
-- practice builder. This is an exact source-taxonomy mapping, not fuzzy concept
-- inference: each generated concept maps only to topic rows sharing the same
-- subject and canonical topic key.

set lock_timeout = '10s';
set statement_timeout = '180s';

create temporary table _dp_qb_source_topic_catalog on commit drop as
select
  subject.id as subject_id,
  subject.slug as subject_slug,
  coalesce(
    nullif(topic.canonical_key, ''),
    nullif(topic.slug, ''),
    topic.id::text
  ) as topic_key,
  min(
    case
      when lower(coalesce(nullif(topic.canonical_name, ''), topic.name)) in (
        'uncategorized',
        'unassigned'
      ) then 'All questions'
      else coalesce(nullif(topic.canonical_name, ''), topic.name)
    end
  ) as topic_name,
  array_agg(distinct topic.name) as aliases,
  min(topic.sort_order) as sort_order,
  count(distinct topic.id) as mapped_topic_rows,
  count(distinct variant.question_id) as ready_questions
from public.dp_qb_subjects subject
join public.dp_qb_courses course
  on course.subject_id = subject.id
join public.dp_qb_topics topic
  on topic.course_id = course.id
join public.dp_qb_variant_topics topic_membership
  on topic_membership.topic_id = topic.id
join public.dp_qb_question_variants variant
  on variant.id = topic_membership.variant_id
 and variant.render_status = 'ready'
group by
  subject.id,
  subject.slug,
  coalesce(
    nullif(topic.canonical_key, ''),
    nullif(topic.slug, ''),
    topic.id::text
  );

do $$
begin
  if (select count(distinct subject_id) from _dp_qb_source_topic_catalog) <> (
    select count(distinct course.subject_id)
    from public.dp_qb_question_variants variant
    join public.dp_qb_courses course on course.id = variant.course_id
    where variant.render_status = 'ready'
  ) then
    raise exception 'Not every render-ready subject resolved into the source-topic catalogue';
  end if;

  if exists (
    select 1
    from _dp_qb_source_topic_catalog
    where ready_questions < 1
       or mapped_topic_rows < 1
       or nullif(topic_name, '') is null
  ) then
    raise exception 'Invalid source-topic catalogue row detected';
  end if;
end;
$$;

insert into public.dp_qb_concept_groups (
  subject_id,
  slug,
  name,
  description,
  sort_order,
  status,
  mapping_version
)
select distinct
  source.subject_id,
  'source-topics',
  'Topics',
  'All render-ready topics from the Question Bank source taxonomy.',
  500,
  'approved',
  1
from _dp_qb_source_topic_catalog source
on conflict (subject_id, slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = 'approved',
    mapping_version = excluded.mapping_version,
    updated_at = now();

update public.dp_qb_concepts concept
set status = 'archived',
    updated_at = now()
where concept.slug like 'source-topic-%';

insert into public.dp_qb_concepts (
  subject_id,
  group_id,
  slug,
  name,
  description,
  aliases,
  sort_order,
  status,
  mapping_version
)
select
  source.subject_id,
  concept_group.id,
  'source-topic-' || substr(md5(source.subject_id || ':' || source.topic_key), 1, 20),
  source.topic_name,
  'All render-ready questions mapped to this exact source topic.',
  coalesce(source.aliases, array[]::text[]),
  source.sort_order,
  'approved',
  1
from _dp_qb_source_topic_catalog source
join public.dp_qb_concept_groups concept_group
  on concept_group.subject_id = source.subject_id
 and concept_group.slug = 'source-topics'
on conflict (subject_id, slug) do update
set group_id = excluded.group_id,
    name = excluded.name,
    description = excluded.description,
    aliases = excluded.aliases,
    sort_order = excluded.sort_order,
    status = 'approved',
    mapping_version = excluded.mapping_version,
    updated_at = now();

delete from public.dp_qb_concept_topic_memberships membership
using public.dp_qb_concepts concept
where membership.concept_id = concept.id
  and concept.slug like 'source-topic-%';

insert into public.dp_qb_concept_topic_memberships (
  concept_id,
  topic_id,
  mapping_source,
  review_notes
)
select distinct
  concept.id,
  topic.id,
  'curated',
  'Exact source taxonomy mapping by subject and canonical topic key.'
from _dp_qb_source_topic_catalog source
join public.dp_qb_concepts concept
  on concept.subject_id = source.subject_id
 and concept.slug =
   'source-topic-' || substr(md5(source.subject_id || ':' || source.topic_key), 1, 20)
join public.dp_qb_courses course
  on course.subject_id = source.subject_id
join public.dp_qb_topics topic
  on topic.course_id = course.id
 and coalesce(
   nullif(topic.canonical_key, ''),
   nullif(topic.slug, ''),
   topic.id::text
 ) = source.topic_key
where exists (
  select 1
  from public.dp_qb_variant_topics topic_membership
  join public.dp_qb_question_variants variant
    on variant.id = topic_membership.variant_id
   and variant.render_status = 'ready'
  where topic_membership.topic_id = topic.id
)
on conflict (concept_id, topic_id) do update
set mapping_source = excluded.mapping_source,
    review_notes = excluded.review_notes,
    updated_at = now();

do $$
begin
  if exists (
    select 1
    from public.dp_qb_concepts concept
    join public.dp_qb_concept_groups concept_group
      on concept_group.id = concept.group_id
     and concept_group.slug = 'source-topics'
    left join lateral private.dp_qb_concept_variant_candidates(concept.id) candidate
      on true
    where concept.status = 'approved'
    group by concept.id
    having count(distinct candidate.question_id) = 0
  ) then
    raise exception 'An approved source topic has no render-ready questions';
  end if;

  if (
    select count(*)
    from public.dp_qb_concepts concept
    join public.dp_qb_concept_groups concept_group
      on concept_group.id = concept.group_id
     and concept_group.slug = 'source-topics'
    where concept.status = 'approved'
  ) <> (select count(*) from _dp_qb_source_topic_catalog) then
    raise exception 'Source-topic concept count does not match the resolved catalogue';
  end if;

  if exists (
    select 1
    from public.dp_qb_concept_topic_memberships membership
    join public.dp_qb_concepts concept on concept.id = membership.concept_id
    join public.dp_qb_topics topic on topic.id = membership.topic_id
    join public.dp_qb_courses course on course.id = topic.course_id
    where concept.slug like 'source-topic-%'
      and concept.subject_id <> course.subject_id
  ) then
    raise exception 'Cross-subject source-topic mapping detected';
  end if;
end;
$$;

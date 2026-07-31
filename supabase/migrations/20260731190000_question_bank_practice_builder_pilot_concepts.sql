-- Reviewed pilot concept catalogue for the cross-subject practice-builder
-- acceptance fixture. Every selector resolves by subject + course + parent topic
-- + subtopic. No name-only or fuzzy mappings are accepted.

set lock_timeout = '10s';
set statement_timeout = '180s';

create or replace function private.dp_qb_concept_variant_candidates(
  p_concept_id uuid
)
returns table (
  variant_id uuid,
  question_id uuid,
  course_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mapped_variants as (
    select membership.variant_id
    from public.dp_qb_concept_topic_memberships concept_topic
    join public.dp_qb_variant_topics membership
      on membership.topic_id = concept_topic.topic_id
    where concept_topic.concept_id = p_concept_id

    union

    select placement.variant_id
    from public.dp_qb_concept_subtopic_memberships concept_subtopic
    join public.dp_qb_question_subtopics placement
      on placement.subtopic_id = concept_subtopic.subtopic_id
    where concept_subtopic.concept_id = p_concept_id

    union

    select override.variant_id
    from public.dp_qb_concept_variant_overrides override
    where override.concept_id = p_concept_id
      and override.action = 'include'
  ),
  excluded_variants as (
    select override.variant_id
    from public.dp_qb_concept_variant_overrides override
    where override.concept_id = p_concept_id
      and override.action = 'exclude'
  )
  select distinct
    variant.id,
    variant.question_id,
    variant.course_id
  from mapped_variants mapped
  join public.dp_qb_question_variants variant
    on variant.id = mapped.variant_id
  where variant.render_status = 'ready'
    and not exists (
      select 1
      from excluded_variants excluded
      where excluded.variant_id = variant.id
    );
$$;

revoke all on function private.dp_qb_concept_variant_candidates(uuid)
  from public;

drop view if exists private.dp_qb_concept_mapping_audit;
create view private.dp_qb_concept_mapping_audit
with (security_invoker = true)
as
select
  subject.slug as subject_slug,
  concept.id as concept_id,
  concept.slug as concept_slug,
  concept.name as concept_name,
  concept.status,
  count(distinct topic_membership.topic_id) as mapped_topics,
  count(distinct subtopic_membership.subtopic_id) as mapped_subtopics,
  count(distinct candidate.course_id) as mapped_courses,
  count(distinct candidate.variant_id) as ready_variants,
  count(distinct candidate.question_id) as ready_questions
from public.dp_qb_concepts concept
join public.dp_qb_subjects subject on subject.id = concept.subject_id
left join public.dp_qb_concept_topic_memberships topic_membership
  on topic_membership.concept_id = concept.id
left join public.dp_qb_concept_subtopic_memberships subtopic_membership
  on subtopic_membership.concept_id = concept.id
left join lateral private.dp_qb_concept_variant_candidates(concept.id) candidate
  on true
group by subject.slug, concept.id, concept.slug, concept.name, concept.status;

create or replace function public.dp_qb_practice_concept_availability()
returns table (
  concept_id uuid,
  course_id uuid,
  question_count bigint
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

  return query
  select
    concept.id,
    candidate.course_id,
    count(distinct candidate.question_id)::bigint
  from public.dp_qb_concepts concept
  join lateral private.dp_qb_concept_variant_candidates(concept.id) candidate
    on true
  where concept.status = 'approved'
  group by concept.id, candidate.course_id
  order by concept.id, candidate.course_id;
end;
$$;

revoke execute on function public.dp_qb_practice_concept_availability()
  from public, anon;
grant execute on function public.dp_qb_practice_concept_availability()
  to authenticated;

create temporary table _dp_qb_pilot_groups (
  subject_slug text not null,
  group_slug text not null,
  group_name text not null,
  sort_order integer not null,
  primary key (subject_slug, group_slug)
) on commit drop;

insert into _dp_qb_pilot_groups values
  ('physics', 'mechanics', 'Mechanics', 10),
  ('mathematics', 'calculus', 'Calculus', 10),
  ('chemistry', 'quantitative-chemistry', 'Quantitative Chemistry', 10);

insert into public.dp_qb_concept_groups (
  subject_id,
  slug,
  name,
  description,
  sort_order,
  status,
  mapping_version
)
select
  subject.id,
  pilot.group_slug,
  pilot.group_name,
  '',
  pilot.sort_order,
  'draft',
  1
from _dp_qb_pilot_groups pilot
join public.dp_qb_subjects subject on subject.slug = pilot.subject_slug
on conflict (subject_id, slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    status = 'draft',
    mapping_version = excluded.mapping_version,
    updated_at = now();

create temporary table _dp_qb_pilot_concepts (
  subject_slug text not null,
  group_slug text not null,
  concept_slug text not null,
  concept_name text not null,
  description text not null,
  aliases text[] not null,
  sort_order integer not null,
  primary key (subject_slug, concept_slug)
) on commit drop;

insert into _dp_qb_pilot_concepts values
  (
    'physics',
    'mechanics',
    'kinematics',
    'Kinematics',
    'Motion, motion graphs and kinematic relationships across reviewed Physics courses.',
    array['Motion']::text[],
    10
  ),
  (
    'physics',
    'mechanics',
    'forces-and-momentum',
    'Forces and Momentum',
    'Forces, Newtonian mechanics, impulse and momentum in the current Physics syllabus.',
    array['Forces', 'Momentum']::text[],
    20
  ),
  (
    'mathematics',
    'calculus',
    'integration',
    'Integration',
    'Integral calculus, definite and indefinite integration, area and volume techniques.',
    array['Integral Calculus']::text[],
    10
  ),
  (
    'chemistry',
    'quantitative-chemistry',
    'stoichiometry',
    'Stoichiometry',
    'The mole, quantitative chemical change and reviewed stoichiometric relationships.',
    array['The Mole', 'Stoichiometric Relationships']::text[],
    10
  );

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
  subject.id,
  concept_group.id,
  pilot.concept_slug,
  pilot.concept_name,
  pilot.description,
  pilot.aliases,
  pilot.sort_order,
  'draft',
  1
from _dp_qb_pilot_concepts pilot
join public.dp_qb_subjects subject on subject.slug = pilot.subject_slug
join public.dp_qb_concept_groups concept_group
  on concept_group.subject_id = subject.id
 and concept_group.slug = pilot.group_slug
on conflict (subject_id, slug) do update
set group_id = excluded.group_id,
    name = excluded.name,
    description = excluded.description,
    aliases = excluded.aliases,
    sort_order = excluded.sort_order,
    status = 'draft',
    mapping_version = excluded.mapping_version,
    updated_at = now();

create temporary table _dp_qb_pilot_selectors (
  selector_order integer primary key,
  subject_slug text not null,
  concept_slug text not null,
  course_slug text not null,
  topic_key text not null,
  subtopic_key text not null,
  review_notes text not null,
  unique (
    subject_slug,
    concept_slug,
    course_slug,
    topic_key,
    subtopic_key
  )
) on commit drop;

insert into _dp_qb_pilot_selectors values
  (1, 'physics', 'kinematics', 'sl-2025', 'space time and motion', 'kinematics', 'Current SL consolidated taxonomy'),
  (2, 'physics', 'kinematics', 'sl-2025', 'a space time and motion', 'kinematics', 'Current SL A-theme taxonomy'),
  (3, 'physics', 'kinematics', 'hl-2025', 'space time and motion', 'kinematics', 'Current HL consolidated taxonomy'),
  (4, 'physics', 'kinematics', 'hl-2025', 'a space time and motion', 'kinematics', 'Current HL A-theme taxonomy'),
  (5, 'physics', 'kinematics', 'sl', 'mechanics', 'motion', 'Legacy SL Mechanics Motion'),
  (6, 'physics', 'kinematics', 'hl', 'mechanics', 'motion', 'Legacy HL Mechanics Motion'),

  (7, 'physics', 'forces-and-momentum', 'sl-2025', 'space time and motion', 'forces and momentum', 'Current SL consolidated taxonomy'),
  (8, 'physics', 'forces-and-momentum', 'sl-2025', 'a space time and motion', 'forces and momentum', 'Current SL A-theme taxonomy'),
  (9, 'physics', 'forces-and-momentum', 'hl-2025', 'space time and motion', 'forces and momentum', 'Current HL consolidated taxonomy'),
  (10, 'physics', 'forces-and-momentum', 'hl-2025', 'a space time and motion', 'forces and momentum', 'Current HL A-theme taxonomy'),

  (11, 'mathematics', 'integration', 'analysis-and-approaches-hl', 'calculus', 'integral calculus', 'AA HL consolidated Integral Calculus'),
  (12, 'mathematics', 'integration', 'analysis-and-approaches-hl', 'calculus', 'sl 5 5 integration introduction areas between curve and x axis', 'AA HL integration introduction'),
  (13, 'mathematics', 'integration', 'analysis-and-approaches-hl', 'calculus', 'sl 5 10 indefinite integration reverse chain by substitution', 'AA HL indefinite integration'),
  (14, 'mathematics', 'integration', 'analysis-and-approaches-hl', 'calculus', 'sl 5 11 definite integrals areas under curve onto x axis and areas between curves', 'AA HL definite integrals'),
  (15, 'mathematics', 'integration', 'analysis-and-approaches-hl', 'calculus', 'ahl 5 15 further derivatives and indefinite integration of these partial fractions', 'AA HL partial fractions and integration'),
  (16, 'mathematics', 'integration', 'analysis-and-approaches-hl', 'calculus', 'ahl 5 16 integration by substitution parts and repeated parts', 'AA HL advanced integration techniques'),
  (17, 'mathematics', 'integration', 'analysis-and-approaches-hl', 'calculus', 'ahl 5 17 areas under curve onto y axis volume of revolution about x and y axes', 'AA HL area and volume applications'),

  (18, 'chemistry', 'stoichiometry', 'sl-2025', 'models of the particulate nature of matter', 'the mole', 'Current SL consolidated mole taxonomy'),
  (19, 'chemistry', 'stoichiometry', 'sl-2025', 'structure 1 models of the particulate nature of matter', 'structure 1 4 counting particles by mass the mole', 'Current SL Structure 1.4'),
  (20, 'chemistry', 'stoichiometry', 'sl-2025', 'reactivity 2 how much how fast and how far', 'reactivity 2 1 how much the amount of chemical change', 'Current SL quantitative chemical change'),
  (21, 'chemistry', 'stoichiometry', 'hl-2025', 'models of the particulate nature of matter', 'the mole', 'Current HL consolidated mole taxonomy'),
  (22, 'chemistry', 'stoichiometry', 'hl-2025', 'structure 1 models of the particulate nature of matter', 'structure 1 4 counting particles by mass the mole', 'Current HL Structure 1.4'),
  (23, 'chemistry', 'stoichiometry', 'hl-2025', 'reactivity 2 how much how fast and how far', 'reactivity 2 1 how much the amount of chemical change', 'Current HL quantitative chemical change'),
  (24, 'chemistry', 'stoichiometry', 'sl', 'stoichiometric relationship', 'stoichiometric relationship', 'Legacy SL stoichiometric relationships'),
  (25, 'chemistry', 'stoichiometry', 'hl', 'stoichiometric relationship', 'stoichiometric relationship', 'Legacy HL stoichiometric relationships');

create temporary table _dp_qb_resolved_pilot_selectors on commit drop as
select
  selector.selector_order,
  selector.subject_slug,
  selector.concept_slug,
  selector.course_slug,
  selector.topic_key,
  selector.subtopic_key,
  selector.review_notes,
  concept.id as concept_id,
  subtopic.id as subtopic_id
from _dp_qb_pilot_selectors selector
join public.dp_qb_subjects subject
  on subject.slug = selector.subject_slug
join public.dp_qb_concepts concept
  on concept.subject_id = subject.id
 and concept.slug = selector.concept_slug
join public.dp_qb_courses course
  on course.subject_id = subject.id
 and course.slug = selector.course_slug
join public.dp_qb_topics topic
  on topic.course_id = course.id
 and topic.canonical_key = selector.topic_key
join public.dp_qb_subtopics subtopic
  on subtopic.course_id = course.id
 and subtopic.topic_id = topic.id
 and subtopic.canonical_key = selector.subtopic_key;

do $$
begin
  if exists (
    select selector.selector_order
    from _dp_qb_pilot_selectors selector
    left join _dp_qb_resolved_pilot_selectors resolved
      on resolved.selector_order = selector.selector_order
    group by selector.selector_order
    having count(resolved.subtopic_id) <> 1
  ) then
    raise exception 'Every reviewed pilot selector must resolve exactly once';
  end if;

  if (select count(*) from _dp_qb_resolved_pilot_selectors) <> 25 then
    raise exception 'Unexpected reviewed pilot selector count';
  end if;
end;
$$;

delete from public.dp_qb_concept_topic_memberships membership
using public.dp_qb_concepts concept
join _dp_qb_pilot_concepts pilot
  on pilot.subject_slug = (
    select subject.slug
    from public.dp_qb_subjects subject
    where subject.id = concept.subject_id
  )
 and pilot.concept_slug = concept.slug
where membership.concept_id = concept.id;

delete from public.dp_qb_concept_variant_overrides override
using public.dp_qb_concepts concept
join _dp_qb_pilot_concepts pilot
  on pilot.subject_slug = (
    select subject.slug
    from public.dp_qb_subjects subject
    where subject.id = concept.subject_id
  )
 and pilot.concept_slug = concept.slug
where override.concept_id = concept.id;

delete from public.dp_qb_concept_subtopic_memberships membership
using public.dp_qb_concepts concept
join _dp_qb_pilot_concepts pilot
  on pilot.subject_slug = (
    select subject.slug
    from public.dp_qb_subjects subject
    where subject.id = concept.subject_id
  )
 and pilot.concept_slug = concept.slug
where membership.concept_id = concept.id;

insert into public.dp_qb_concept_subtopic_memberships (
  concept_id,
  subtopic_id,
  mapping_source,
  review_notes
)
select
  resolved.concept_id,
  resolved.subtopic_id,
  'curated',
  resolved.review_notes
from _dp_qb_resolved_pilot_selectors resolved
order by resolved.selector_order;

do $$
begin
  if exists (
    select concept.id
    from public.dp_qb_concepts concept
    join _dp_qb_pilot_concepts pilot
      on pilot.concept_slug = concept.slug
    join public.dp_qb_subjects subject
      on subject.id = concept.subject_id
     and subject.slug = pilot.subject_slug
    left join lateral private.dp_qb_concept_variant_candidates(concept.id) candidate
      on true
    group by concept.id
    having count(distinct candidate.question_id) = 0
  ) then
    raise exception 'Every approved pilot concept must have ready questions';
  end if;

  if exists (
    select 1
    from public.dp_qb_concept_subtopic_memberships membership
    join public.dp_qb_concepts concept on concept.id = membership.concept_id
    join public.dp_qb_subtopics subtopic on subtopic.id = membership.subtopic_id
    join public.dp_qb_courses course on course.id = subtopic.course_id
    where concept.subject_id <> course.subject_id
  ) then
    raise exception 'Cross-subject concept mapping detected';
  end if;
end;
$$;

update public.dp_qb_concepts concept
set status = 'approved',
    mapping_version = 1,
    updated_at = now()
from _dp_qb_pilot_concepts pilot
join public.dp_qb_subjects subject on subject.slug = pilot.subject_slug
where concept.subject_id = subject.id
  and concept.slug = pilot.concept_slug;

update public.dp_qb_concept_groups concept_group
set status = 'approved',
    mapping_version = 1,
    updated_at = now()
from _dp_qb_pilot_groups pilot
join public.dp_qb_subjects subject on subject.slug = pilot.subject_slug
where concept_group.subject_id = subject.id
  and concept_group.slug = pilot.group_slug;

do $$
begin
  if exists (
    select 1
    from private.dp_qb_concept_mapping_audit audit
    where audit.concept_slug in (
      'kinematics',
      'forces-and-momentum',
      'integration',
      'stoichiometry'
    )
      and (
        audit.status <> 'approved'
        or audit.mapped_subtopics = 0
        or audit.mapped_courses = 0
        or audit.ready_questions = 0
      )
  ) then
    raise exception 'Pilot concept audit failed';
  end if;
end;
$$;

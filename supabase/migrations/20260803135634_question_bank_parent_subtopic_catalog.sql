-- Present the practice catalogue as larger-topic headings with cleaned,
-- selectable source topics beneath them. The imported Question Bank taxonomy
-- remains source-preserving and untouched. The previous larger-topic concepts
-- stay available as hidden redirects for drafts and shares created before this
-- hierarchy was introduced.

set lock_timeout = '10s';
set statement_timeout = '300s';

create temporary table _dp_qb_parent_subtopic_protected_counts on commit drop as
select
  (select count(*) from public.dp_qb_questions) as questions,
  (select count(*) from public.dp_qb_question_variants) as variants,
  (select count(*) from public.dp_qb_topics) as source_topics,
  (select count(*) from public.dp_qb_subtopics) as subtopics,
  (select count(*) from public.dp_qb_assets) as assets;

create or replace function pg_temp.dp_qb_picker_label(input text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text := btrim(coalesce(input, ''));
begin
  cleaned := regexp_replace(cleaned, '^[12][0-9]{3}[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^HL Options[[:space:]]+HL Option[[:space:]]+[A-Z0-9]+[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^Prescribed Subjects[[:space:]]+Prescribed Subject[[:space:]]+[A-Z0-9]+[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^Prescribed Subjects[[:space:]]+[A-Z0-9]+[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^World History Topics[[:space:]]+[A-Z0-9]+[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^Topics[[:space:]]+Topic[[:space:]]+[A-Z0-9]+[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^Optional Themes[[:space:]]+Option[[:space:]]+[A-Z][[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^Qualitative Research Methodology[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^HL Extension[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^(Core|Options)[[:space:]]+', '', 'i');
  cleaned := regexp_replace(cleaned, '^(Unit|Section|Topic|Option)[[:space:]]+[A-Z0-9]+[[:space:]]+', '', 'i');
  cleaned := regexp_replace(
    cleaned,
    '^[A-E][[:space:]]+(Space|The Particulate|Wave|Fields|Nuclear)',
    '\1',
    'i'
  );
  cleaned := regexp_replace(cleaned, '[[:space:]]*\((AHL|HL|SL)\)[[:space:]]*$', '', 'i');
  cleaned := regexp_replace(cleaned, '[[:space:]]+(AHL|HL|SL)[[:space:]]*$', '', 'i');
  cleaned := regexp_replace(cleaned, '[[:space:]]+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '[[:space:]]+And[[:space:]]+', ' and ', 'g');
  cleaned := regexp_replace(cleaned, '(^|[[:space:]])Hl($|[[:space:]])', '\1HL\2', 'gi');
  cleaned := regexp_replace(cleaned, '(^|[[:space:]])Ess($|[[:space:]])', '\1ESS\2', 'gi');
  cleaned := regexp_replace(cleaned, '(^|[[:space:]])Usa($|[[:space:]])', '\1USA\2', 'gi');
  if cleaned ~* '^the[[:space:]]' then
    cleaned := 'The ' || substr(cleaned, 5);
  end if;
  return btrim(cleaned);
end;
$$;

create or replace function pg_temp.dp_qb_picker_child_label(
  subject_slug text,
  parent_name text,
  input_name text
)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text := pg_temp.dp_qb_picker_label(input_name);
  topic_key text := pg_temp.dp_qb_picker_key(cleaned);
begin
  case subject_slug
    when 'mathematics' then
      if topic_key in (
        'number algebra', 'number and algebra',
        'numbers algebra', 'numbers and algebra'
      ) then
        return 'Number and Algebra';
      elsif topic_key in (
        'statistics probability', 'statistics and probability',
        'statistics probabilities', 'statistics and probabilities'
      ) then
        return 'Statistics and Probability';
      elsif topic_key = 'permutation combination' then
        return 'Permutations and Combinations';
      elsif topic_key = 'exponentials logarithms' then
        return 'Exponentials and Logarithms';
      elsif topic_key = 'sequences series' then
        return 'Sequences and Series';
      elsif topic_key = 'vectors lines planes' then
        return 'Vectors, Lines and Planes';
      elsif topic_key = 'functions roots' then
        return 'Functions and Roots';
      end if;

    when 'physics' then
      if topic_key = 'the particulate nature of matter' then
        return 'Particulate Nature of Matter';
      elsif topic_key in (
        'atomic nuclear particle physics',
        'atomic nuclear and particle physics'
      ) then
        return 'Atomic, Nuclear and Particle Physics';
      end if;

    when 'chemistry' then
      if topic_key in (
        'stoichiometry', 'stoichiometric relationship',
        'stoichiometric relationships'
      ) then
        return 'Stoichiometry';
      elsif topic_key in (
        'models of the particulate nature of matter',
        'structure 1 models of the particulate nature of matter'
      ) then
        return 'Structure 1: Models of the Particulate Nature of Matter';
      elsif topic_key in (
        'models of bonding structure', 'models of bonding and structure',
        'structure 2 models of bonding structure',
        'structure 2 models of bonding and structure'
      ) then
        return 'Structure 2: Models of Bonding and Structure';
      elsif topic_key in (
        'classification of matter',
        'structure 3 classification of matter'
      ) then
        return 'Structure 3: Classification of Matter';
      elsif topic_key in (
        'what drives chemical reactions',
        'reactivity 1 what drives chemical reactions'
      ) then
        return 'Reactivity 1: What Drives Chemical Reactions';
      elsif topic_key in (
        'how much how fast how far', 'how much how fast and how far',
        'reactivity 2 how much how fast how far',
        'reactivity 2 how much how fast and how far'
      ) then
        return 'Reactivity 2: How Much, How Fast and How Far';
      elsif topic_key in (
        'mechanisms of chemical change',
        'reactivity 3 what are the mechanisms of chemical change',
        'reactivity 3 mechanisms of chemical change'
      ) then
        return 'Reactivity 3: Mechanisms of Chemical Change';
      elsif topic_key = 'energetics thermochemistry' then
        return 'Energetics / Thermochemistry';
      elsif topic_key = 'equilibrium' then
        return 'Equilibrium';
      elsif topic_key = 'redox processes' then
        return 'Redox Processes';
      elsif topic_key = 'measurement analysis' then
        return 'Measurement and Analysis';
      elsif topic_key in (
        'the periodic table the transition metals',
        'the periodic table transition metals'
      ) then
        return 'The Periodic Table and Transition Metals';
      end if;
    else
      null;
  end case;

  return cleaned;
end;
$$;

create or replace function pg_temp.dp_qb_picker_key(input text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(input, '')), '&', ' and ', 'g'),
      '[^a-z0-9]+', ' ', 'g'
    ),
    '[[:space:]]+', ' ', 'g'
  ));
$$;

create temporary table _dp_qb_picker_parents on commit drop as
select
  subject.id as subject_id,
  subject.slug as subject_slug,
  parent_group.id as parent_group_id,
  concept.id as parent_concept_id,
  concept.name as parent_name,
  concept.sort_order as parent_sort_order,
  concept.legacy_concept_ids
from public.dp_qb_concepts concept
join public.dp_qb_concept_groups parent_group
  on parent_group.id = concept.group_id
 and parent_group.slug = 'larger-topics'
join public.dp_qb_subjects subject on subject.id = concept.subject_id
where concept.status = 'approved';

create temporary table _dp_qb_picker_legacy on commit drop as
select
  parent.subject_id,
  parent.subject_slug,
  parent.parent_group_id,
  parent.parent_concept_id,
  parent.parent_name,
  parent.parent_sort_order,
  legacy.id as legacy_concept_id,
  legacy.name as legacy_name,
  legacy.aliases as legacy_aliases,
  legacy.sort_order as legacy_sort_order
from _dp_qb_picker_parents parent
cross join lateral unnest(parent.legacy_concept_ids) legacy_id
join public.dp_qb_concepts legacy on legacy.id = legacy_id;

-- Exact reviewed decompositions for the genuine multi-topic source labels.
-- Commas that are part of one official title (for example "Space, Time and
-- Motion" or "Logic, Sets and Probability") are intentionally not listed.
create temporary table _dp_qb_picker_composite_map (
  subject_slug text not null,
  source_name text not null,
  target_parent_name text not null,
  child_name text not null,
  component_order integer not null,
  primary key (subject_slug, source_name, target_parent_name, child_name)
) on commit drop;

insert into _dp_qb_picker_composite_map values
  ('mathematics', 'Sets, Relations And Groups, Discrete Mathematics', 'Discrete Mathematics', 'Sets, Relations and Groups', 10),
  ('mathematics', 'Sets, Relations And Groups, Discrete Mathematics', 'Discrete Mathematics', 'General questions', 20),
  ('mathematics', 'Descriptive Statistics, Logic, Sets And Probability', 'Statistics and Probability', 'Descriptive Statistics', 10),
  ('mathematics', 'Descriptive Statistics, Logic, Sets And Probability', 'Statistics and Probability', 'Logic, Sets and Probability', 20),
  ('mathematics', 'Logic, Sets And Probability, Statistical Applications', 'Statistics and Probability', 'Logic, Sets and Probability', 10),
  ('mathematics', 'Logic, Sets And Probability, Statistical Applications', 'Statistics and Probability', 'Statistical Applications', 20),
  ('mathematics', 'Numbers And Algebra, Logic, Sets And Probability', 'Number and Algebra', 'General questions', 10),
  ('mathematics', 'Numbers And Algebra, Logic, Sets And Probability', 'Statistics and Probability', 'Logic, Sets and Probability', 20),

  ('physics', 'Energy Production, Atomic, nuclear and Particle Physics', 'Energy Production', 'General questions', 10),
  ('physics', 'Energy Production, Atomic, nuclear and Particle Physics', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 20),
  ('physics', 'Electricity and Magnetism, Atomic, nuclear and Particle Physics', 'Fields', 'Electricity and Magnetism', 10),
  ('physics', 'Electricity and Magnetism, Atomic, nuclear and Particle Physics', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 20),
  ('physics', 'Electricity and Magnetism, Fields (AHL), Atomic, nuclear and Particle Physics', 'Fields', 'Electricity and Magnetism', 10),
  ('physics', 'Electricity and Magnetism, Fields (AHL), Atomic, nuclear and Particle Physics', 'Fields', 'General questions', 20),
  ('physics', 'Electricity and Magnetism, Fields (AHL), Atomic, nuclear and Particle Physics', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 30),
  ('physics', 'Atomic, nuclear and Particle Physics, Electricity and Magnetism', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 10),
  ('physics', 'Atomic, nuclear and Particle Physics, Electricity and Magnetism', 'Fields', 'Electricity and Magnetism', 20),
  ('physics', 'Atomic, nuclear and Particle Physics, Energy Production', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 10),
  ('physics', 'Atomic, nuclear and Particle Physics, Energy Production', 'Energy Production', 'General questions', 20),
  ('physics', 'Atomic, nuclear and Particle Physics, Oscillations and Waves', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 10),
  ('physics', 'Atomic, nuclear and Particle Physics, Oscillations and Waves', 'Wave Behaviour', 'Oscillations and Waves', 20),
  ('physics', 'Atomic, nuclear and Particle Physics, Quantum and Nuclear Physics (AHL)', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 10),
  ('physics', 'Atomic, nuclear and Particle Physics, Quantum and Nuclear Physics (AHL)', 'Nuclear and Quantum Physics', 'Quantum and Nuclear Physics', 20),
  ('physics', 'Atomic, nuclear and Particle Physics, Quantum and Nuclear Physics (AHL), Measurements and Uncertainties', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 10),
  ('physics', 'Atomic, nuclear and Particle Physics, Quantum and Nuclear Physics (AHL), Measurements and Uncertainties', 'Nuclear and Quantum Physics', 'Quantum and Nuclear Physics', 20),
  ('physics', 'Atomic, nuclear and Particle Physics, Quantum and Nuclear Physics (AHL), Measurements and Uncertainties', 'Measurements and Uncertainties', 'General questions', 30),
  ('physics', 'Quantum and Nuclear Physics (AHL), Atomic, nuclear and Particle Physics', 'Nuclear and Quantum Physics', 'Quantum and Nuclear Physics', 10),
  ('physics', 'Quantum and Nuclear Physics (AHL), Atomic, nuclear and Particle Physics', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 20),
  ('physics', 'Mechanics, Atomic, nuclear and Particle Physics', 'Space, Time and Motion', 'Mechanics', 10),
  ('physics', 'Mechanics, Atomic, nuclear and Particle Physics', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 20),
  ('physics', 'Mechanics, Circular Motion and Gravitation, Atomic, nuclear and Particle Physics', 'Space, Time and Motion', 'Mechanics', 10),
  ('physics', 'Mechanics, Circular Motion and Gravitation, Atomic, nuclear and Particle Physics', 'Space, Time and Motion', 'Circular Motion and Gravitation', 20),
  ('physics', 'Mechanics, Circular Motion and Gravitation, Atomic, nuclear and Particle Physics', 'Nuclear and Quantum Physics', 'Atomic, Nuclear and Particle Physics', 30),

  ('chemistry', 'Chemical Bonding and Structure (HL), Measurement and Analysis (HL), Redox Processes (HL)', 'Structure 2: Models of Bonding and Structure', 'Chemical Bonding and Structure', 10),
  ('chemistry', 'Chemical Bonding and Structure (HL), Measurement and Analysis (HL), Redox Processes (HL)', 'Measurement and Data Processing', 'Measurement and Analysis', 20),
  ('chemistry', 'Chemical Bonding and Structure (HL), Measurement and Analysis (HL), Redox Processes (HL)', 'Reactivity 3: Mechanisms of Chemical Change', 'Redox Processes', 30),
  ('chemistry', 'Energetics / Thermochemistry (HL), Organic Chemistry (HL), Measurement and Analysis (HL)', 'Reactivity 1: What Drives Chemical Reactions', 'Energetics / Thermochemistry', 10),
  ('chemistry', 'Energetics / Thermochemistry (HL), Organic Chemistry (HL), Measurement and Analysis (HL)', 'Structure 3: Classification of Matter', 'Organic Chemistry', 20),
  ('chemistry', 'Energetics / Thermochemistry (HL), Organic Chemistry (HL), Measurement and Analysis (HL)', 'Measurement and Data Processing', 'Measurement and Analysis', 30),
  ('chemistry', 'Chemical Kinetics (HL), Energetics / Thermochemistry (HL)', 'Reactivity 2: How Much, How Fast and How Far', 'Chemical Kinetics', 10),
  ('chemistry', 'Chemical Kinetics (HL), Energetics / Thermochemistry (HL)', 'Reactivity 1: What Drives Chemical Reactions', 'Energetics / Thermochemistry', 20),
  ('chemistry', 'Organic Chemistry (HL), Energetics / Thermochemistry (HL)', 'Structure 3: Classification of Matter', 'Organic Chemistry', 10),
  ('chemistry', 'Organic Chemistry (HL), Energetics / Thermochemistry (HL)', 'Reactivity 1: What Drives Chemical Reactions', 'Energetics / Thermochemistry', 20),
  ('chemistry', 'Organic Chemistry, Energetics / Thermochemistry (HL)', 'Structure 3: Classification of Matter', 'Organic Chemistry', 10),
  ('chemistry', 'Organic Chemistry, Energetics / Thermochemistry (HL)', 'Reactivity 1: What Drives Chemical Reactions', 'Energetics / Thermochemistry', 20);

create temporary table _dp_qb_picker_child_sources on commit drop as
with composite_names as (
  select distinct subject_slug, lower(source_name) as source_name
  from _dp_qb_picker_composite_map
), ordinary as (
  select
    legacy.subject_id,
    legacy.subject_slug,
    legacy.parent_group_id,
    legacy.parent_concept_id,
    legacy.parent_name,
    legacy.parent_sort_order,
    legacy.legacy_concept_id,
    case
      when pg_temp.dp_qb_picker_key(pg_temp.dp_qb_picker_child_label(
             legacy.subject_slug,
             legacy.parent_name,
             legacy.legacy_name
           )) =
           pg_temp.dp_qb_picker_key(legacy.parent_name)
        then 'General questions'
      else pg_temp.dp_qb_picker_child_label(
        legacy.subject_slug,
        legacy.parent_name,
        legacy.legacy_name
      )
    end as child_name,
    legacy.legacy_sort_order as child_sort_order,
    legacy.legacy_name,
    legacy.legacy_aliases
  from _dp_qb_picker_legacy legacy
  left join composite_names composite
    on composite.subject_slug = legacy.subject_slug
   and composite.source_name = lower(legacy.legacy_name)
  where composite.source_name is null
), decomposed as (
  select
    parent.subject_id,
    parent.subject_slug,
    parent.parent_group_id,
    parent.parent_concept_id,
    parent.parent_name,
    parent.parent_sort_order,
    legacy.legacy_concept_id,
    component.child_name,
    legacy.legacy_sort_order + component.component_order as child_sort_order,
    legacy.legacy_name,
    legacy.legacy_aliases
  from _dp_qb_picker_legacy legacy
  join _dp_qb_picker_composite_map component
    on component.subject_slug = legacy.subject_slug
   and lower(component.source_name) = lower(legacy.legacy_name)
  join _dp_qb_picker_parents parent
    on parent.subject_id = legacy.subject_id
   and parent.parent_name = component.target_parent_name
)
select * from ordinary
union all
select * from decomposed;

alter table _dp_qb_picker_child_sources
  add column child_key text generated always as (
    pg_temp.dp_qb_picker_key(child_name)
  ) stored;

do $$
begin
  if exists (
    select 1
    from _dp_qb_picker_legacy legacy
    where not exists (
      select 1 from _dp_qb_picker_child_sources source
      where source.legacy_concept_id = legacy.legacy_concept_id
    )
  ) then
    raise exception 'A legacy practice concept was not assigned to a selectable subtopic';
  end if;

  if exists (
    select 1 from _dp_qb_picker_child_sources
    where nullif(child_key, '') is null
  ) then
    raise exception 'A selectable practice subtopic has an empty canonical key';
  end if;

  if exists (
    select 1
    from _dp_qb_picker_composite_map component
    where not exists (
      select 1 from _dp_qb_picker_legacy legacy
      where legacy.subject_slug = component.subject_slug
        and lower(legacy.legacy_name) = lower(component.source_name)
    )
  ) then
    raise exception 'A reviewed multi-topic decomposition no longer matches the source catalogue';
  end if;
end;
$$;

-- One approved group per actual larger topic. The old generic group becomes a
-- hidden redirect layer after all children have been created successfully.
update public.dp_qb_concept_groups concept_group
set status = 'archived', updated_at = now()
where concept_group.slug like 'practice-subtopics-%';

insert into public.dp_qb_concept_groups (
  subject_id,
  parent_group_id,
  slug,
  name,
  description,
  sort_order,
  status,
  mapping_version
)
select
  parent.subject_id,
  parent.parent_group_id,
  'practice-subtopics-' || substr(md5(parent.parent_concept_id::text), 1, 20),
  parent.parent_name,
  'Selectable subtopics within ' || parent.parent_name || '.',
  parent.parent_sort_order,
  'approved',
  3
from _dp_qb_picker_parents parent
on conflict (subject_id, slug) do update
set parent_group_id = excluded.parent_group_id,
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status,
    mapping_version = excluded.mapping_version,
    updated_at = now();

update public.dp_qb_concepts concept
set status = 'archived', updated_at = now()
where concept.slug like 'practice-subtopic-%';

insert into public.dp_qb_concepts (
  subject_id,
  group_id,
  slug,
  name,
  description,
  aliases,
  legacy_concept_ids,
  sort_order,
  status,
  mapping_version
)
select
  source.subject_id,
  concept_group.id,
  'practice-subtopic-' || substr(md5(
    source.subject_id || ':' || source.parent_concept_id || ':' || source.child_key
  ), 1, 20),
  min(source.child_name),
  'Questions mapped to this selectable subtopic across its available courses.',
  coalesce(array_agg(distinct alias order by alias) filter (
    where nullif(btrim(alias), '') is not null
  ), array[]::text[]),
  array[]::uuid[],
  min(source.child_sort_order),
  'approved',
  3
from _dp_qb_picker_child_sources source
join public.dp_qb_concept_groups concept_group
  on concept_group.subject_id = source.subject_id
 and concept_group.slug =
   'practice-subtopics-' || substr(md5(source.parent_concept_id::text), 1, 20)
cross join lateral unnest(array_prepend(source.legacy_name, source.legacy_aliases)) alias
group by
  source.subject_id,
  source.parent_concept_id,
  source.child_key,
  concept_group.id
on conflict (subject_id, slug) do update
set group_id = excluded.group_id,
    name = excluded.name,
    description = excluded.description,
    aliases = excluded.aliases,
    legacy_concept_ids = excluded.legacy_concept_ids,
    sort_order = excluded.sort_order,
    status = excluded.status,
    mapping_version = excluded.mapping_version,
    updated_at = now();

delete from public.dp_qb_concept_topic_memberships membership
using public.dp_qb_concepts concept
where membership.concept_id = concept.id
  and concept.slug like 'practice-subtopic-%';

delete from public.dp_qb_concept_subtopic_memberships membership
using public.dp_qb_concepts concept
where membership.concept_id = concept.id
  and concept.slug like 'practice-subtopic-%';

delete from public.dp_qb_concept_variant_overrides override_row
using public.dp_qb_concepts concept
where override_row.concept_id = concept.id
  and concept.slug like 'practice-subtopic-%';

insert into public.dp_qb_concept_topic_memberships (
  concept_id,
  topic_id,
  mapping_source,
  review_notes
)
select distinct
  target.id,
  membership.topic_id,
  'curated',
  'Reviewed larger-topic heading with a cleaned selectable source topic.'
from _dp_qb_picker_child_sources source
join public.dp_qb_concept_groups concept_group
  on concept_group.subject_id = source.subject_id
 and concept_group.slug =
   'practice-subtopics-' || substr(md5(source.parent_concept_id::text), 1, 20)
join public.dp_qb_concepts target
  on target.group_id = concept_group.id
 and target.slug = 'practice-subtopic-' || substr(md5(
   source.subject_id || ':' || source.parent_concept_id || ':' || source.child_key
 ), 1, 20)
join public.dp_qb_concept_topic_memberships membership
  on membership.concept_id = source.legacy_concept_id
on conflict (concept_id, topic_id) do update
set mapping_source = excluded.mapping_source,
    review_notes = excluded.review_notes,
    updated_at = now();

insert into public.dp_qb_concept_subtopic_memberships (
  concept_id,
  subtopic_id,
  mapping_source,
  review_notes
)
select distinct
  target.id,
  membership.subtopic_id,
  'curated',
  'Reviewed larger-topic heading with a cleaned selectable source topic.'
from _dp_qb_picker_child_sources source
join public.dp_qb_concept_groups concept_group
  on concept_group.subject_id = source.subject_id
 and concept_group.slug =
   'practice-subtopics-' || substr(md5(source.parent_concept_id::text), 1, 20)
join public.dp_qb_concepts target
  on target.group_id = concept_group.id
 and target.slug = 'practice-subtopic-' || substr(md5(
   source.subject_id || ':' || source.parent_concept_id || ':' || source.child_key
 ), 1, 20)
join public.dp_qb_concept_subtopic_memberships membership
  on membership.concept_id = source.legacy_concept_id
on conflict (concept_id, subtopic_id) do update
set mapping_source = excluded.mapping_source,
    review_notes = excluded.review_notes,
    updated_at = now();

insert into public.dp_qb_concept_variant_overrides (
  concept_id,
  variant_id,
  action,
  reason
)
select distinct on (target.id, override_row.variant_id)
  target.id,
  override_row.variant_id,
  override_row.action,
  'Inherited from a reviewed source-topic selector: ' || override_row.reason
from _dp_qb_picker_child_sources source
join public.dp_qb_concept_groups concept_group
  on concept_group.subject_id = source.subject_id
 and concept_group.slug =
   'practice-subtopics-' || substr(md5(source.parent_concept_id::text), 1, 20)
join public.dp_qb_concepts target
  on target.group_id = concept_group.id
 and target.slug = 'practice-subtopic-' || substr(md5(
   source.subject_id || ':' || source.parent_concept_id || ':' || source.child_key
 ), 1, 20)
join public.dp_qb_concept_variant_overrides override_row
  on override_row.concept_id = source.legacy_concept_id
order by
  target.id,
  override_row.variant_id,
  case override_row.action when 'exclude' then 0 else 1 end
on conflict (concept_id, variant_id) do update
set action = excluded.action,
    reason = excluded.reason,
    updated_at = now();

-- Hide the generic heading from new selections. Its concepts stay approved and
-- queryable so old drafts/share codes keep their exact previous candidate set.
update public.dp_qb_concept_groups concept_group
set status = 'archived', updated_at = now()
where concept_group.slug = 'larger-topics';

-- Authenticated members may read only this archived redirect group's metadata.
-- All other archived/draft catalogue groups remain hidden, and the application
-- deliberately excludes this group from new selections.
drop policy if exists dp_qb_concept_groups_member_read
  on public.dp_qb_concept_groups;
create policy dp_qb_concept_groups_member_read
on public.dp_qb_concept_groups for select
to authenticated
using (
  private.dp_qb_has_access()
  and (status = 'approved' or slug = 'larger-topics')
);

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
set statement_timeout = '30s'
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question bank access denied' using errcode = '42501';
  end if;

  return query
  with mapped_variants as (
    select membership.concept_id, placement.variant_id
    from public.dp_qb_concept_topic_memberships membership
    join public.dp_qb_variant_topics placement
      on placement.topic_id = membership.topic_id

    union

    select membership.concept_id, placement.variant_id
    from public.dp_qb_concept_subtopic_memberships membership
    join public.dp_qb_question_subtopics placement
      on placement.subtopic_id = membership.subtopic_id

    union

    select override.concept_id, override.variant_id
    from public.dp_qb_concept_variant_overrides override
    where override.action = 'include'
  ), eligible as (
    select distinct
      mapped.concept_id,
      variant.course_id,
      variant.question_id
    from mapped_variants mapped
    join public.dp_qb_concepts concept
      on concept.id = mapped.concept_id
     and concept.status = 'approved'
    join public.dp_qb_concept_groups concept_group
      on concept_group.id = concept.group_id
     and (
       concept_group.status = 'approved'
       or concept_group.slug = 'larger-topics'
     )
    join public.dp_qb_question_variants variant
      on variant.id = mapped.variant_id
     and variant.render_status = 'ready'
    where not exists (
      select 1
      from public.dp_qb_concept_variant_overrides excluded
      where excluded.concept_id = mapped.concept_id
        and excluded.variant_id = mapped.variant_id
        and excluded.action = 'exclude'
    )
  )
  select
    eligible.concept_id,
    eligible.course_id,
    count(distinct eligible.question_id)::bigint
  from eligible
  group by eligible.concept_id, eligible.course_id
  order by eligible.concept_id, eligible.course_id;
end;
$$;

revoke execute on function public.dp_qb_practice_concept_availability()
  from public, anon;
grant execute on function public.dp_qb_practice_concept_availability()
  to authenticated;

create temporary table _dp_qb_picker_parent_candidates on commit drop as
select distinct
  parent.parent_concept_id,
  candidate.question_id,
  candidate.course_id
from _dp_qb_picker_parents parent
join lateral private.dp_qb_concept_variant_candidates(parent.parent_concept_id)
  candidate on true;

create index on _dp_qb_picker_parent_candidates (
  parent_concept_id,
  course_id,
  question_id
);

create temporary table _dp_qb_picker_child_candidates on commit drop as
select distinct
  parent.parent_concept_id,
  candidate.question_id,
  candidate.course_id
from _dp_qb_picker_parents parent
join public.dp_qb_concept_groups concept_group
  on concept_group.subject_id = parent.subject_id
 and concept_group.slug =
   'practice-subtopics-' || substr(md5(parent.parent_concept_id::text), 1, 20)
join public.dp_qb_concepts concept
  on concept.group_id = concept_group.id
 and concept.status = 'approved'
join lateral private.dp_qb_concept_variant_candidates(concept.id)
  candidate on true;

create index on _dp_qb_picker_child_candidates (
  parent_concept_id,
  course_id,
  question_id
);

do $$
declare
  before_counts record;
  after_counts record;
begin
  select * into before_counts from _dp_qb_parent_subtopic_protected_counts;
  select
    (select count(*) from public.dp_qb_questions) as questions,
    (select count(*) from public.dp_qb_question_variants) as variants,
    (select count(*) from public.dp_qb_topics) as source_topics,
    (select count(*) from public.dp_qb_subtopics) as subtopics,
    (select count(*) from public.dp_qb_assets) as assets
  into after_counts;

  if row(before_counts.questions, before_counts.variants, before_counts.source_topics,
         before_counts.subtopics, before_counts.assets)
     is distinct from
     row(after_counts.questions, after_counts.variants, after_counts.source_topics,
         after_counts.subtopics, after_counts.assets) then
    raise exception 'Parent/subtopic catalogue changed protected Question Bank counts';
  end if;

  if (
    select count(*) from public.dp_qb_concept_groups
    where slug like 'practice-subtopics-%' and status = 'approved'
  ) <> (select count(*) from _dp_qb_picker_parents) then
    raise exception 'Every larger topic must have exactly one selectable subtopic group';
  end if;

  if exists (
    select 1
    from public.dp_qb_concept_groups concept_group
    join public.dp_qb_concepts concept on concept.group_id = concept_group.id
    where concept_group.slug like 'practice-subtopics-%'
      and concept_group.status = 'approved'
      and concept.status = 'approved'
      and lower(concept.name) in (
        select lower(source_name) from _dp_qb_picker_composite_map
      )
  ) then
    raise exception 'A comma-chain source label remains selectable';
  end if;

  if exists (
    select concept.group_id, pg_temp.dp_qb_picker_key(concept.name)
    from public.dp_qb_concepts concept
    join public.dp_qb_concept_groups concept_group on concept_group.id = concept.group_id
    where concept_group.slug like 'practice-subtopics-%'
      and concept_group.status = 'approved'
      and concept.status = 'approved'
    group by concept.group_id, pg_temp.dp_qb_picker_key(concept.name)
    having count(*) > 1
  ) then
    raise exception 'A larger-topic heading contains duplicate selectable subtopics';
  end if;

  if exists (
    select 1
    from public.dp_qb_concept_groups concept_group
    join public.dp_qb_concepts concept on concept.group_id = concept_group.id
    left join lateral private.dp_qb_concept_variant_candidates(concept.id)
      candidate on true
    where concept_group.slug like 'practice-subtopics-%'
      and concept_group.status = 'approved'
      and concept.status = 'approved'
    group by concept.id
    having count(candidate.question_id) = 0
  ) then
    raise exception 'A selectable practice subtopic has no render-ready questions';
  end if;

  if exists (
    select 1
    from _dp_qb_picker_parent_candidates parent
    where not exists (
      select 1
      from _dp_qb_picker_child_candidates child
      where child.parent_concept_id = parent.parent_concept_id
        and child.course_id = parent.course_id
        and child.question_id = parent.question_id
    )
  ) then
    raise exception 'Selectable subtopics do not cover every larger-topic question';
  end if;

  if exists (
    select 1 from public.dp_qb_concept_groups
    where slug = 'larger-topics' and status <> 'archived'
  ) then
    raise exception 'The generic Larger topics group must remain hidden';
  end if;
end;
$$;

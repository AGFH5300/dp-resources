-- Replace the mixed pilot/source practice catalogue with one reviewed layer of
-- larger student-facing topics. Imported questions, variants, source topics,
-- subtopics and assets remain unchanged. Older concept ids stay approved behind
-- archived groups and are recorded as redirects so drafts and shares still open.

set lock_timeout = '10s';
set statement_timeout = '300s';

create temporary table _dp_qb_larger_topic_protected_counts on commit drop as
select
  (select count(*) from public.dp_qb_questions) as questions,
  (select count(*) from public.dp_qb_question_variants) as variants,
  (select count(*) from public.dp_qb_topics) as source_topics,
  (select count(*) from public.dp_qb_subtopics) as subtopics,
  (select count(*) from public.dp_qb_assets) as assets;

alter table public.dp_qb_concepts
  add column if not exists legacy_concept_ids uuid[] not null
  default array[]::uuid[];

comment on column public.dp_qb_concepts.legacy_concept_ids is
  'Older practice-catalogue ids redirected to this larger topic; imported taxonomy ids are not stored here.';

create or replace function pg_temp.dp_qb_clean_topic_label(input text)
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
  cleaned := regexp_replace(cleaned, '[[:space:]]+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '(^|[[:space:]])Hl($|[[:space:]])', '\1HL\2', 'gi');
  cleaned := regexp_replace(cleaned, '(^|[[:space:]])Ess($|[[:space:]])', '\1ESS\2', 'gi');
  cleaned := regexp_replace(cleaned, '(^|[[:space:]])Usa($|[[:space:]])', '\1USA\2', 'gi');
  if cleaned ~* '^the[[:space:]]' then
    cleaned := 'The ' || substr(cleaned, 5);
  end if;
  return btrim(cleaned);
end;
$$;

create or replace function pg_temp.dp_qb_topic_key(input text)
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

create or replace function pg_temp.dp_qb_larger_topic_name(
  subject_slug text,
  input_name text
)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text := pg_temp.dp_qb_clean_topic_label(input_name);
  topic_key text := pg_temp.dp_qb_topic_key(cleaned);
begin
  case subject_slug
    when 'mathematics' then
      if topic_key ~ '(calculus|integration|differentiation|differential equations)' then
        return 'Calculus';
      elsif topic_key ~ '(functions|mathematical models|graphs)' then
        return 'Functions';
      elsif topic_key ~ '(statistics|probability|probabilities|permutation|combination|logic sets)' then
        return 'Statistics and Probability';
      elsif topic_key ~ '(geometry|trigonometry|vectors|radian)' then
        return 'Geometry and Trigonometry';
      elsif topic_key ~ '(discrete mathematics|sets relations and groups)' then
        return 'Discrete Mathematics';
      elsif topic_key ~ 'kinematics' then
        return 'Calculus';
      else
        return 'Number and Algebra';
      end if;

    when 'physics' then
      if topic_key in (
        'inquiry', 'tools', 'tools and inquiries', 'nature of science',
        'scientific skills and tools'
      ) then
        return null;
      elsif topic_key ~ '^astrophysics' then
        return 'Astrophysics';
      elsif topic_key ~ '^engineering physics' then
        return 'Engineering Physics';
      elsif topic_key ~ '^energy production' then
        return 'Energy Production';
      elsif topic_key ~ '^imaging' then
        return 'Imaging';
      elsif topic_key ~ '^(atomic|quantum|nuclear|e nuclear)' then
        return 'Nuclear and Quantum Physics';
      elsif topic_key ~ '^(electricity|electromagnetic|fields?|d fields|induction)' then
        return 'Fields';
      elsif topic_key ~ '(wave|oscillation)' then
        return 'Wave Behaviour';
      elsif topic_key ~ '(particulate|thermal)' then
        return 'Particulate Nature of Matter';
      elsif topic_key ~ '(space time|mechanics|circular motion|gravitation|relativity|kinematics|forces and momentum)' then
        return 'Space, Time and Motion';
      elsif topic_key ~ '(atomic|quantum|nuclear)' then
        return 'Nuclear and Quantum Physics';
      elsif topic_key ~ '(electricity|magnetism|fields?|electromagnetic|induction|alternating currents|capacitance)' then
        return 'Fields';
      else
        return cleaned;
      end if;

    when 'chemistry' then
      if topic_key ~ '^(tools|inquiry|empty topic)' then
        return null;
      elsif topic_key ~ '^materials$' then
        return 'Materials';
      elsif topic_key ~ '^biochemistry$' then
        return 'Biochemistry';
      elsif topic_key ~ '^medicinal chemistry$' then
        return 'Medicinal Chemistry';
      elsif topic_key ~ 'measurement and (analysis|data processing)' then
        return 'Measurement and Data Processing';
      elsif topic_key ~ '(stoich|atomic structure|particulate nature)' then
        return 'Structure 1: Models of the Particulate Nature of Matter';
      elsif topic_key ~ '(bonding|periodic|periodicity|transition metals)' then
        return 'Structure 2: Models of Bonding and Structure';
      elsif topic_key ~ '(classification of matter|organic chemistry)' then
        return 'Structure 3: Classification of Matter';
      elsif topic_key ~ '(mechanisms of chemical change|redox)' then
        return 'Reactivity 3: Mechanisms of Chemical Change';
      elsif topic_key ~ '(how much how fast and how far|chemical kinetics|equilibrium|acids and bases)' then
        return 'Reactivity 2: How Much, How Fast and How Far';
      elsif topic_key ~ '(what drives chemical reactions|energetics|thermochemistry|^energy$)' then
        return 'Reactivity 1: What Drives Chemical Reactions';
      else
        return cleaned;
      end if;

    when 'biology' then
      if topic_key = 'data analysis' then
        return null;
      end if;
      cleaned := regexp_replace(cleaned, '[[:space:]]*\(AHL\)[[:space:]]*$', '', 'i');
      if pg_temp.dp_qb_topic_key(cleaned) = 'metabolism cell respiration and photosynthesis' then
        return 'Metabolism, Cell Respiration and Photosynthesis';
      end if;
      return cleaned;

    when 'business' then
      if topic_key ~ '(business organization and environment|introduction to business management)' then
        return 'Introduction to Business Management';
      elsif topic_key ~ 'human resource management' then
        return 'Human Resource Management';
      elsif topic_key ~ 'finance and accounts' then
        return 'Finance and Accounts';
      elsif topic_key ~ '^marketing$' then
        return 'Marketing';
      elsif topic_key ~ 'operations? management' then
        return 'Operations Management';
      elsif topic_key ~ 'business management toolkit' then
        return 'Business Management Toolkit';
      else
        return cleaned;
      end if;

    when 'economics' then
      if topic_key ~ '(foundation|introduction to economics)' then
        return 'Introduction to Economics';
      elsif topic_key ~ '^microeconomics' then
        return 'Microeconomics';
      elsif topic_key ~ '^macroeconomics' then
        return 'Macroeconomics';
      elsif topic_key ~ '(global economy|international economics|development economics)' then
        return 'The Global Economy';
      else
        return cleaned;
      end if;

    when 'psychology' then
      if topic_key ~ 'biological' then
        return 'Biological Approach';
      elsif topic_key ~ 'cognitive' then
        return 'Cognitive Approach';
      elsif topic_key ~ 'sociocultural' then
        return 'Sociocultural Approach';
      elsif topic_key ~ '(research|qualitative)'
         or topic_key in ('case studies', 'interviews') then
        return 'Research Methods';
      elsif topic_key ~ 'abnormal psychology' then
        return 'Abnormal Psychology';
      elsif topic_key ~ 'developmental psychology' then
        return 'Developmental Psychology';
      elsif topic_key ~ 'health psychology' then
        return 'Health Psychology';
      elsif topic_key ~ 'human relationships' then
        return 'Human Relationships';
      elsif topic_key ~ 'sport psychology' then
        return 'Sport Psychology';
      else
        return cleaned;
      end if;

    when 'ess' then
      if topic_key ~ '^(foundation|foundations)' then
        return 'Foundations of Environmental Systems and Societies';
      elsif topic_key ~ 'ecosystems and ecology' then
        return 'Ecosystems and Ecology';
      elsif topic_key ~ 'biodiversity and conservation' then
        return 'Biodiversity and Conservation';
      elsif topic_key ~ '(water and aquatic food production)' then
        return 'Water Systems and Aquatic Food Production';
      elsif topic_key ~ '(soil and terrestrial food production|soil systems and terrestrial food production)' then
        return 'Soil Systems and Terrestrial Food Production';
      elsif topic_key ~ 'atmospher' then
        return 'Atmospheric Systems';
      elsif topic_key ~ 'climate change and energy production' then
        return 'Climate Change and Energy Production';
      elsif topic_key ~ 'human systems and resource use' then
        return 'Human Systems and Resource Use';
      elsif topic_key ~ 'hl lenses' then
        return 'HL Lenses';
      else
        return cleaned;
      end if;

    when 'geography' then
      if topic_key ~ '(populations in transition|changing population)' then
        return 'Changing Population';
      elsif topic_key ~ '(disparities in wealth and development|human development and diversity)' then
        return 'Human Development and Diversity';
      elsif topic_key ~ '(environmental quality and sustainability|global climate vulnerability)' then
        return 'Global Climate and Environmental Change';
      elsif topic_key ~ '(patterns in resource consumption|global resource consumption)' then
        return 'Global Resource Consumption and Security';
      elsif topic_key ~ 'freshwater' then
        return 'Freshwater';
      elsif topic_key ~ '(oceans and their coastal margins|oceans and coastal margins)' then
        return 'Oceans and Coastal Margins';
      elsif topic_key ~ 'extreme environments' then
        return 'Extreme Environments';
      elsif topic_key ~ '(hazards and disasters|geophysical hazards)' then
        return 'Geophysical Hazards';
      elsif topic_key ~ '(leisure sport and tourism|leisure tourism and sport)' then
        return 'Leisure, Tourism and Sport';
      elsif topic_key ~ '(geography of food and health|food and health)' then
        return 'Food and Health';
      elsif topic_key ~ 'urban environments' then
        return 'Urban Environments';
      elsif topic_key ~ '^global interactions' then
        return 'Global Interactions';
      elsif topic_key ~ 'power places and networks' then
        return 'Power, Places and Networks';
      elsif topic_key ~ 'global risks and resilience' then
        return 'Global Risks and Resilience';
      else
        return cleaned;
      end if;

    when 'history' then
      if topic_key ~ 'authoritarian states' then
        return 'Authoritarian States';
      elsif topic_key ~ '^independence movements' then
        return 'Independence Movements';
      else
        return cleaned;
      end if;

    when 'english-b' then
      return 'Identities';
    when 'french-b' then
      return 'Identités';
    when 'spanish-b' then
      return 'Identidades';
    else
      return cleaned;
  end case;
end;
$$;

create or replace function pg_temp.dp_qb_larger_topic_sort(
  subject_slug text,
  topic_name text
)
returns integer
language sql
immutable
as $$
  select case subject_slug || ':' || topic_name
    when 'mathematics:Number and Algebra' then 10
    when 'mathematics:Functions' then 20
    when 'mathematics:Geometry and Trigonometry' then 30
    when 'mathematics:Statistics and Probability' then 40
    when 'mathematics:Calculus' then 50
    when 'mathematics:Discrete Mathematics' then 60
    when 'physics:Space, Time and Motion' then 10
    when 'physics:Particulate Nature of Matter' then 20
    when 'physics:Wave Behaviour' then 30
    when 'physics:Fields' then 40
    when 'physics:Nuclear and Quantum Physics' then 50
    when 'physics:Energy Production' then 60
    when 'physics:Astrophysics' then 70
    when 'physics:Engineering Physics' then 80
    when 'physics:Imaging' then 90
    when 'chemistry:Structure 1: Models of the Particulate Nature of Matter' then 10
    when 'chemistry:Structure 2: Models of Bonding and Structure' then 20
    when 'chemistry:Structure 3: Classification of Matter' then 30
    when 'chemistry:Reactivity 1: What Drives Chemical Reactions' then 40
    when 'chemistry:Reactivity 2: How Much, How Fast and How Far' then 50
    when 'chemistry:Reactivity 3: Mechanisms of Chemical Change' then 60
    when 'chemistry:Measurement and Data Processing' then 70
    when 'chemistry:Materials' then 80
    when 'chemistry:Biochemistry' then 90
    when 'chemistry:Medicinal Chemistry' then 100
    when 'economics:Introduction to Economics' then 10
    when 'economics:Microeconomics' then 20
    when 'economics:Macroeconomics' then 30
    when 'economics:The Global Economy' then 40
    else 500
  end;
$$;

create temporary table _dp_qb_larger_topic_sources on commit drop as
select
  subject.id as subject_id,
  subject.slug as subject_slug,
  concept.id as source_concept_id,
  concept.name as source_name,
  concept.aliases as source_aliases,
  pg_temp.dp_qb_larger_topic_name(subject.slug, concept.name) as canonical_name
from public.dp_qb_concepts concept
join public.dp_qb_subjects subject on subject.id = concept.subject_id
where concept.status = 'approved'
  and concept.slug not like 'larger-topic-%';

alter table _dp_qb_larger_topic_sources
  add column canonical_key text generated always as (
    pg_temp.dp_qb_topic_key(canonical_name)
  ) stored;

create temporary table _dp_qb_larger_topic_groups on commit drop as
select
  source.subject_id,
  source.subject_slug,
  source.canonical_key,
  min(source.canonical_name) as canonical_name,
  pg_temp.dp_qb_larger_topic_sort(
    source.subject_slug,
    min(source.canonical_name)
  ) as sort_order,
  array_agg(distinct source.source_concept_id order by source.source_concept_id) as legacy_concept_ids
from _dp_qb_larger_topic_sources source
where source.canonical_name is not null
group by source.subject_id, source.subject_slug, source.canonical_key;

do $$
begin
  if exists (
    select 1
    from _dp_qb_larger_topic_sources
    where canonical_name is not null
      and nullif(canonical_key, '') is null
  ) then
    raise exception 'A larger practice topic has an empty canonical key';
  end if;

  if exists (
    select 1
    from _dp_qb_larger_topic_groups
    where cardinality(legacy_concept_ids) > 25
  ) then
    raise exception 'A larger practice topic redirects more than 25 old catalogue concepts';
  end if;

  if exists (
    select 1
    from (
      values
        ('biology', 18),
        ('mathematics', 6),
        ('physics', 10),
        ('chemistry', 10),
        ('business', 6),
        ('psychology', 9),
        ('economics', 4),
        ('ess', 9),
        ('geography', 14)
    ) expected(subject_slug, topic_count)
    left join (
      select subject_slug, count(*)::integer as topic_count
      from _dp_qb_larger_topic_groups
      group by subject_slug
    ) actual using (subject_slug)
    where actual.topic_count is distinct from expected.topic_count
  ) then
    raise exception 'Reviewed larger-topic subject counts do not match expectations';
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
  'larger-topics',
  'Larger topics',
  'Broad student-facing topics combining equivalent current, legacy and source-specific catalogue labels.',
  10,
  'approved',
  2
from _dp_qb_larger_topic_groups source
on conflict (subject_id, slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status,
    mapping_version = excluded.mapping_version,
    updated_at = now();

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
  mapped.subject_id,
  concept_group.id,
  'larger-topic-' || substr(md5(mapped.subject_id || ':' || mapped.canonical_key), 1, 20),
  mapped.canonical_name,
  'All render-ready questions mapped to this reviewed larger topic across its available courses.',
  coalesce((
    select array_agg(distinct alias order by alias)
    from _dp_qb_larger_topic_sources source
    cross join lateral unnest(array_prepend(source.source_name, source.source_aliases)) alias
    where source.subject_id = mapped.subject_id
      and source.canonical_key = mapped.canonical_key
      and nullif(btrim(alias), '') is not null
  ), array[]::text[]),
  mapped.legacy_concept_ids,
  mapped.sort_order,
  'approved',
  2
from _dp_qb_larger_topic_groups mapped
join public.dp_qb_concept_groups concept_group
  on concept_group.subject_id = mapped.subject_id
 and concept_group.slug = 'larger-topics'
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
  and concept.slug like 'larger-topic-%';

delete from public.dp_qb_concept_subtopic_memberships membership
using public.dp_qb_concepts concept
where membership.concept_id = concept.id
  and concept.slug like 'larger-topic-%';

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
  'Reviewed larger-topic union of current, legacy and source-specific catalogue mappings.'
from _dp_qb_larger_topic_sources source
join public.dp_qb_concepts target
  on target.subject_id = source.subject_id
 and target.slug =
   'larger-topic-' || substr(md5(source.subject_id || ':' || source.canonical_key), 1, 20)
join public.dp_qb_concept_topic_memberships membership
  on membership.concept_id = source.source_concept_id
where source.canonical_name is not null
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
  'Reviewed larger-topic union of current, legacy and source-specific catalogue mappings.'
from _dp_qb_larger_topic_sources source
join public.dp_qb_concepts target
  on target.subject_id = source.subject_id
 and target.slug =
   'larger-topic-' || substr(md5(source.subject_id || ':' || source.canonical_key), 1, 20)
join public.dp_qb_concept_subtopic_memberships membership
  on membership.concept_id = source.source_concept_id
where source.canonical_name is not null
on conflict (concept_id, subtopic_id) do update
set mapping_source = excluded.mapping_source,
    review_notes = excluded.review_notes,
    updated_at = now();

update public.dp_qb_concept_groups concept_group
set status = 'archived',
    updated_at = now()
where concept_group.slug <> 'larger-topics'
  and exists (
    select 1
    from _dp_qb_larger_topic_sources source
    where source.subject_id = concept_group.subject_id
  );

-- Availability must include only the approved visible group. Old concepts stay
-- queryable by the candidate engine for backwards-compatible saved configs.
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
     and concept_group.status = 'approved'
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

do $$
declare
  before_counts record;
  after_counts record;
begin
  select * into before_counts from _dp_qb_larger_topic_protected_counts;
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
    raise exception 'Larger-topic catalogue migration changed protected Question Bank counts';
  end if;

  if exists (
    select 1
    from public.dp_qb_concepts concept
    join public.dp_qb_concept_groups concept_group on concept_group.id = concept.group_id
    left join lateral private.dp_qb_concept_variant_candidates(concept.id) candidate on true
    where concept_group.slug = 'larger-topics'
      and concept.status = 'approved'
    group by concept.id
    having count(distinct candidate.question_id) = 0
  ) then
    raise exception 'An approved larger practice topic has no render-ready questions';
  end if;

  if exists (
    select 1
    from public.dp_qb_concept_groups
    where slug = 'larger-topics' and status <> 'approved'
  ) or exists (
    select 1
    from public.dp_qb_concept_groups
    where slug <> 'larger-topics'
      and subject_id in (select distinct subject_id from _dp_qb_larger_topic_sources)
      and status = 'approved'
  ) then
    raise exception 'Practice catalogue exposes mixed hierarchy generations';
  end if;

  if exists (
    select 1
    from public.dp_qb_concepts concept
    join public.dp_qb_concept_groups concept_group on concept_group.id = concept.group_id
    where concept_group.slug = 'larger-topics'
      and concept.status = 'approved'
      and lower(concept.name) in (
        'tools', 'inquiry', 'tools and inquiries', 'empty topic', 'data analysis'
      )
  ) then
    raise exception 'A non-topic source label remains in the larger-topic catalogue';
  end if;

  if exists (
    select 1
    from public.dp_qb_concepts concept
    join public.dp_qb_concept_groups concept_group on concept_group.id = concept.group_id
    join public.dp_qb_subjects subject on subject.id = concept.subject_id
    where concept_group.slug = 'larger-topics'
      and subject.slug in ('mathematics', 'physics', 'chemistry')
      and concept.name ~* '(^|, )[A-Za-z ]+, [A-Za-z ]+'
      and concept.name not in (
        'Space, Time and Motion',
        'Reactivity 2: How Much, How Fast and How Far'
      )
  ) then
    raise exception 'A combined source label remains in a reviewed larger-topic science catalogue';
  end if;
end;
$$;

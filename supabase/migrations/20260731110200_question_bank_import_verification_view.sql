-- Give service-role import verification both a logical placement count and an
-- original source-key relation. Multiple source aliases may legitimately point
-- to one physically consolidated subtopic placement.

create or replace view public.dp_qb_import_logical_placements
with (security_invoker = true)
as
select
  placement.variant_id,
  placement.subtopic_id as placement_id
from public.dp_qb_question_subtopics placement
union all
select
  placement.variant_id,
  placement.source_subtopic_id as placement_id
from public.dp_qb_variant_topic_only_sources placement;

create or replace view public.dp_qb_import_placement_sources
with (security_invoker = true)
as
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
join public.dp_qb_question_variants variant
  on variant.id = placement.variant_id
join public.dp_qb_subtopic_sources source
  on source.source_topic_id = variant.source_topic_id
 and source.subtopic_id = placement.subtopic_id
 and not source.is_topic_only
union all
select
  placement.variant_id,
  placement.source_subtopic_id,
  placement.placement_order,
  placement.placement_difficulty,
  placement.is_fallback,
  placement.fallback_reason,
  placement.created_by_batch_id,
  placement.last_seen_batch_id
from public.dp_qb_variant_topic_only_sources placement;

revoke all on public.dp_qb_import_logical_placements
  from public, anon, authenticated;
revoke all on public.dp_qb_import_placement_sources
  from public, anon, authenticated;
grant select on public.dp_qb_import_logical_placements to service_role;
grant select on public.dp_qb_import_placement_sources to service_role;

do $$
begin
  if (select count(*) from public.dp_qb_import_logical_placements) <> 48797 then
    raise exception
      'Expected 48797 logical placements, found %',
      (select count(*) from public.dp_qb_import_logical_placements);
  end if;
  if exists (
    select 1
    from public.dp_qb_import_placement_sources
    group by variant_id, source_subtopic_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate source placement keys remain';
  end if;
  if has_table_privilege(
    'anon',
    'public.dp_qb_import_logical_placements',
    'select'
  ) or has_table_privilege(
    'authenticated',
    'public.dp_qb_import_logical_placements',
    'select'
  ) or has_table_privilege(
    'anon',
    'public.dp_qb_import_placement_sources',
    'select'
  ) or has_table_privilege(
    'authenticated',
    'public.dp_qb_import_placement_sources',
    'select'
  ) then
    raise exception 'Import verification views are exposed to members';
  end if;
end;
$$;

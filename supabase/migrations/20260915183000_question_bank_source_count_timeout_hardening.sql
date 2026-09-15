-- Keep content-source option counts below the hosted Postgres statement timeout.
-- The previous implementation ran two correlated COUNT(DISTINCT ...) subqueries
-- once per active source. Exact reviewed-row indexes plus one grouped pass per
-- attribution table avoid repeatedly rescanning the same data.

create index if not exists dp_qb_variant_sources_reviewed_source_variant_idx
  on public.dp_qb_variant_sources (source_id, variant_id)
  where review_status = 'reviewed';

create index if not exists dp_resource_source_assignments_reviewed_source_file_idx
  on public.dp_resource_source_assignments (source_id, drive_file_id)
  where review_status = 'reviewed';

create or replace function public.dp_content_source_options()
returns table (
  slug text, display_name text, short_label text, attribution_label text,
  display_order integer, question_variant_count bigint, resource_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Member access is required' using errcode = '42501';
  end if;

  return query
  with question_counts as (
    select provenance.source_id,
           count(distinct provenance.variant_id)::bigint as question_variant_count
    from public.dp_qb_variant_sources provenance
    where provenance.review_status = 'reviewed'
    group by provenance.source_id
  ), resource_counts as (
    select reviewed.source_id, count(*)::bigint as resource_count
    from (
      select distinct assignment.source_id, assignment.drive_file_id
      from public.dp_resource_source_assignments assignment
      where assignment.review_status = 'reviewed'
    ) reviewed
    join public.dp_resource_index index_row
      on index_row.drive_file_id = reviewed.drive_file_id
    group by reviewed.source_id
  )
  select source.slug, source.display_name, source.short_label,
         source.attribution_label, source.display_order,
         coalesce(question_counts.question_variant_count, 0)::bigint,
         coalesce(resource_counts.resource_count, 0)::bigint
  from public.dp_content_sources source
  left join question_counts on question_counts.source_id = source.id
  left join resource_counts on resource_counts.source_id = source.id
  where source.is_active
  order by source.display_order, source.display_name;
end;
$$;

revoke execute on function public.dp_content_source_options() from public, anon;
grant execute on function public.dp_content_source_options() to authenticated, service_role;

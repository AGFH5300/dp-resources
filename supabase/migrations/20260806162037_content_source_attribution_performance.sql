-- Performance repair discovered during the production attribution audit.
-- Keep precedence queryable so Drive-file/source predicates can use indexes,
-- and aggregate Question Bank source counts before joining registry rows.

create or replace view public.dp_resource_effective_source_assignments
with (security_invoker = true)
as
select assignment.id, assignment.drive_file_id, assignment.source_id,
       assignment.is_primary, assignment.relationship, assignment.review_status,
       assignment.assignment_method, assignment.inherited_from_drive_file_id,
       case assignment.assignment_method
         when 'admin_override' then 1 when 'manual' then 1
         when 'import_manifest' then 2 when 'folder_inheritance' then 3
         when 'reviewed_path_rule' then 4 when 'reviewed_filename_rule' then 5
         else 99 end as precedence
from public.dp_resource_source_assignments assignment
where assignment.review_status <> 'rejected'
  and not exists (
    select 1
    from public.dp_resource_source_assignments better
    where better.drive_file_id = assignment.drive_file_id
      and better.review_status <> 'rejected'
      and (case better.assignment_method
        when 'admin_override' then 1 when 'manual' then 1
        when 'import_manifest' then 2 when 'folder_inheritance' then 3
        when 'reviewed_path_rule' then 4 when 'reviewed_filename_rule' then 5
        else 99 end) <
        (case assignment.assignment_method
        when 'admin_override' then 1 when 'manual' then 1
        when 'import_manifest' then 2 when 'folder_inheritance' then 3
        when 'reviewed_path_rule' then 4 when 'reviewed_filename_rule' then 5
        else 99 end)
  );

create or replace function public.dp_admin_content_source_audit()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'questionSources', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select source.slug, source.display_name, source.display_order,
          coalesce(question_counts.question_cores, 0)::bigint as question_cores,
          coalesce(variant_counts.variants, 0)::bigint as variants
        from public.dp_content_sources source
        left join (
          select source_id, count(distinct question_id)::bigint question_cores
          from public.dp_qb_question_sources where review_status <> 'rejected'
          group by source_id
        ) question_counts on question_counts.source_id = source.id
        left join (
          select source_id, count(distinct variant_id)::bigint variants
          from public.dp_qb_variant_sources where review_status <> 'rejected'
          group by source_id
        ) variant_counts on variant_counts.source_id = source.id
      ) stats
    ), '[]'::jsonb),
    'multiSourceQuestions', (
      select count(*) from (
        select question_id from public.dp_qb_question_sources
        where review_status <> 'rejected'
        group by question_id having count(distinct source_id) > 1
      ) multi
    ),
    'readyVariantsWithoutReviewedSource', (
      select count(*) from public.dp_qb_question_variants variant
      where variant.render_status = 'ready' and not exists (
        select 1 from public.dp_qb_variant_sources provenance
        where provenance.variant_id = variant.id and provenance.review_status = 'reviewed'
      )
    ),
    'variantSourcesUnderReview', (
      select count(*) from public.dp_qb_variant_sources where review_status = 'under_review'
    ),
    'questionSourcesUnderReview', (
      select count(*) from public.dp_qb_question_sources where review_status = 'under_review'
    ),
    'coreVariantSourceConflicts', (
      select count(*) from public.dp_qb_variant_sources variant_source
      join public.dp_qb_question_variants variant on variant.id = variant_source.variant_id
      where variant_source.review_status <> 'rejected' and not exists (
        select 1 from public.dp_qb_question_sources question_source
        where question_source.question_id = variant.question_id
          and question_source.source_id = variant_source.source_id
          and question_source.review_status <> 'rejected'
      )
    ),
    'librarySources', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select source.slug, source.display_name, source.display_order,
          coalesce(counts.files, 0)::bigint files,
          coalesce(counts.folders, 0)::bigint folders
        from public.dp_content_sources source
        left join (
          select assignment.source_id,
            count(distinct assignment.drive_file_id) filter (where not index_row.is_folder)::bigint files,
            count(distinct assignment.drive_file_id) filter (where index_row.is_folder)::bigint folders
          from public.dp_resource_effective_source_assignments assignment
          join public.dp_resource_index index_row on index_row.drive_file_id = assignment.drive_file_id
          group by assignment.source_id
        ) counts on counts.source_id = source.id
      ) stats
    ), '[]'::jsonb),
    'libraryAssignmentsByMethod', coalesce((
      select jsonb_object_agg(assignment_method, count_rows)
      from (
        select assignment_method, count(*)::bigint count_rows
        from public.dp_resource_source_assignments
        where review_status <> 'rejected' group by assignment_method
      ) methods
    ), '{}'::jsonb),
    'libraryFilesWithMultipleSources', (
      select count(*) from (
        select assignment.drive_file_id
        from public.dp_resource_effective_source_assignments assignment
        join public.dp_resource_index index_row
          on index_row.drive_file_id = assignment.drive_file_id and not index_row.is_folder
        group by assignment.drive_file_id having count(distinct assignment.source_id) > 1
      ) multi
    ),
    'resourceTypes', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select resource_type.slug, resource_type.display_name, resource_type.display_order,
          coalesce(counts.resources, 0)::bigint resources,
          coalesce(counts.under_review, 0)::bigint under_review
        from public.dp_resource_types resource_type
        left join (
          select resource_type_id, count(*)::bigint resources,
            count(*) filter (where review_status = 'under_review')::bigint under_review
          from public.dp_resource_type_assignments group by resource_type_id
        ) counts on counts.resource_type_id = resource_type.id
      ) stats
    ), '[]'::jsonb),
    'recentChanges', coalesce((
      select jsonb_agg(row_to_json(changes)) from (
        select target_kind, target_id, action, actor_user_id, change_version, created_at
        from public.dp_content_source_audit_log order by created_at desc limit 50
      ) changes
    ), '[]'::jsonb)
  );
$$;

revoke all on table public.dp_resource_effective_source_assignments from public, anon, authenticated;
grant select on table public.dp_resource_effective_source_assignments to service_role;
revoke execute on function public.dp_admin_content_source_audit() from public, anon, authenticated;
grant execute on function public.dp_admin_content_source_audit() to service_role;

analyze public.dp_qb_question_sources;
analyze public.dp_qb_variant_sources;
analyze public.dp_resource_source_assignments;
analyze public.dp_resource_type_assignments;
analyze public.dp_resource_index;

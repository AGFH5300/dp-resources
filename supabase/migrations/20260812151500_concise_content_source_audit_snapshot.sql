-- Keep the cached audit focused on populated coverage rows and effective
-- assignment methods.

create or replace function public.dp_admin_content_source_type_audit()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'resourceTypes', coalesce((
      select jsonb_agg(row_to_json(stats) order by stats.display_order)
      from (
        select resource_type.slug, resource_type.display_name, resource_type.display_order,
               counts.resources::bigint as resources,
               counts.under_review::bigint as under_review
        from public.dp_resource_types resource_type
        join (
          select resource_type_id, count(*)::bigint as resources,
                 count(*) filter (where review_status = 'under_review')::bigint as under_review
          from public.dp_resource_type_assignments
          group by resource_type_id
        ) counts on counts.resource_type_id = resource_type.id
        where counts.resources > 0 or counts.under_review > 0
      ) stats
    ), '[]'::jsonb),
    'recentChanges', coalesce((
      select jsonb_agg(row_to_json(changes))
      from (
        select target_kind, target_id, action, actor_user_id, change_version, created_at
        from public.dp_content_source_audit_log
        order by created_at desc
        limit 50
      ) changes
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dp_admin_content_source_type_audit() from public, anon, authenticated;
grant execute on function public.dp_admin_content_source_type_audit() to service_role;

create or replace function public.dp_admin_refresh_content_source_audit()
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_audit jsonb;
begin
  v_audit :=
    public.dp_admin_content_source_qb_coverage()
    || public.dp_admin_content_source_qb_summary()
    || public.dp_admin_content_source_qb_ready_gap()
    || public.dp_admin_content_source_qb_conflicts()
    || public.dp_admin_content_source_library_coverage()
    || public.dp_admin_content_source_type_audit();

  insert into public.dp_content_source_audit_snapshot (
    singleton, audit, refreshed_at, dirty_at
  ) values (
    true, v_audit, clock_timestamp(), null
  )
  on conflict (singleton) do update set
    audit = excluded.audit,
    refreshed_at = excluded.refreshed_at,
    dirty_at = null;

  return v_audit;
end;
$$;

revoke all on function public.dp_admin_refresh_content_source_audit() from public, anon, authenticated;
grant execute on function public.dp_admin_refresh_content_source_audit() to service_role;

select public.dp_admin_refresh_content_source_audit();

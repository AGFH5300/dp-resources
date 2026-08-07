-- Post-merge content-source correctness hardening.
-- 1. A reviewed explicit primary Library source is unique per Drive item.
-- 2. Saved-question source filtering happens before pagination.
-- 3. Public Question Bank source APIs never expose named under-review providers.

create unique index if not exists dp_resource_one_reviewed_primary_override_uidx
  on public.dp_resource_source_assignments (drive_file_id)
  where is_primary
    and review_status = 'reviewed'
    and inherited_from_drive_file_id is null
    and assignment_method in ('admin_override', 'manual');

create or replace function public.dp_admin_set_resource_source(
  p_actor_user_id uuid,
  p_drive_file_id text,
  p_source_slug text,
  p_recursive boolean default false,
  p_relationship text default 'primary'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target_source_id uuid;
  method text := case when p_recursive then 'manual' else 'admin_override' end;
  before_state jsonb;
  preview jsonb;
begin
  if not exists (
    select 1 from public.dp_resource_memberships membership
    where membership.id = p_actor_user_id and membership.role = 'admin'
      and membership.is_suspended is false
  ) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_relationship not in ('primary','adapted_from','compiled_from','contributed_by','hosted_from') then
    raise exception 'Invalid source relationship' using errcode = '22023';
  end if;
  select id into target_source_id from public.dp_content_sources
  where slug = p_source_slug and is_active;
  if target_source_id is null then raise exception 'Unknown source' using errcode = '22023'; end if;
  preview := public.dp_admin_preview_resource_source_assignment(p_drive_file_id, p_source_slug, p_recursive);
  if p_recursive and not exists (
    select 1 from public.dp_resource_index where drive_file_id = p_drive_file_id and is_folder
  ) then raise exception 'Recursive assignment requires a folder' using errcode = '22023'; end if;

  select jsonb_agg(jsonb_build_object(
    'sourceId', source_id, 'method', assignment_method,
    'relationship', relationship, 'reviewStatus', review_status
  )) into before_state
  from public.dp_resource_source_assignments where drive_file_id = p_drive_file_id;

  -- Replacing the primary source supersedes any prior explicit primary at this
  -- item/folder. Rejected rows are retained as provenance/audit history, and a
  -- folder inheritance rebuild below removes their derived descendants.
  if p_relationship = 'primary' then
    update public.dp_resource_source_assignments
    set is_primary = false, review_status = 'rejected',
        applies_to_descendants = false, updated_at = now(), last_resolved_at = now()
    where drive_file_id = p_drive_file_id
      and inherited_from_drive_file_id is null
      and assignment_method in ('admin_override', 'manual')
      and is_primary
      and review_status <> 'rejected'
      and not (source_id = target_source_id and assignment_method = method
               and relationship = p_relationship);
  end if;

  update public.dp_resource_source_assignments
  set is_primary = p_relationship = 'primary', relationship = p_relationship,
      confidence = 1, review_status = 'reviewed',
      applies_to_descendants = p_recursive, created_by = p_actor_user_id,
      updated_at = now(), last_resolved_at = now()
  where drive_file_id = p_drive_file_id and source_id = target_source_id
    and assignment_method = method and inherited_from_drive_file_id is null
    and relationship = p_relationship;
  if not found then
    insert into public.dp_resource_source_assignments (
      drive_file_id, source_id, is_primary, relationship, assignment_method,
      confidence, review_status, applies_to_descendants, created_by,
      resolution_version, last_resolved_at
    ) values (
      p_drive_file_id, target_source_id, p_relationship = 'primary', p_relationship,
      method, 1, 'reviewed', p_recursive, p_actor_user_id,
      'admin_v2', now()
    );
  end if;

  perform public.dp_resolve_resource_source_inheritance('admin_v2');
  insert into public.dp_content_source_audit_log (
    actor_user_id, target_kind, target_id, action, before_state, after_state, change_version
  ) values (
    p_actor_user_id, case when p_recursive then 'resource_folder' else 'resource_file' end,
    p_drive_file_id, 'set_source', before_state,
    jsonb_build_object('sourceSlug', p_source_slug, 'relationship', p_relationship,
                       'recursive', p_recursive, 'preview', preview), 'admin_v2'
  );
  return preview || jsonb_build_object('applied', true);
end;
$$;

revoke execute on function public.dp_admin_set_resource_source(uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.dp_admin_set_resource_source(uuid, text, text, boolean, text)
  to service_role;

create or replace function public.dp_qb_list_saved_questions(
  p_source_slugs text[] default null,
  p_limit integer default 20
)
returns table (
  question_id uuid,
  last_variant_id uuid,
  created_at timestamptz,
  reference text,
  course_slug text,
  course_name text,
  subject_slug text,
  topic_name text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  requesting_user uuid := (select auth.uid());
begin
  if requesting_user is null or not private.dp_qb_has_access() then
    raise exception 'Question Bank access denied' using errcode = '42501';
  end if;
  return query
  select saved.question_id, saved.last_variant_id, saved.created_at,
         question.reference, course.slug, course.name, subject.slug,
         private.dp_qb_variant_topic_names(variant.id)
  from public.dp_qb_user_saved_questions saved
  join public.dp_qb_questions question on question.id = saved.question_id
  join public.dp_qb_question_variants variant on variant.id = saved.last_variant_id
  join public.dp_qb_courses course on course.id = variant.course_id
  join public.dp_qb_subjects subject on subject.id = course.subject_id
  where saved.user_id = requesting_user
    and variant.render_status = 'ready'
    and (
      coalesce(cardinality(p_source_slugs), 0) = 0
      or exists (
        select 1
        from public.dp_qb_variant_sources provenance
        join public.dp_content_sources source on source.id = provenance.source_id
        where provenance.variant_id = saved.last_variant_id
          and provenance.review_status = 'reviewed'
          and source.is_active
          and source.slug = any(p_source_slugs)
      )
    )
  order by saved.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke execute on function public.dp_qb_list_saved_questions(text[], integer)
  from public, anon;
grant execute on function public.dp_qb_list_saved_questions(text[], integer)
  to authenticated, service_role;

create or replace function public.dp_qb_public_sources_for_variants(p_variant_ids uuid[])
returns table (
  variant_id uuid,
  question_id uuid,
  source_slug text,
  display_name text,
  short_label text,
  attribution_label text,
  display_order integer,
  review_status text,
  is_variant_source boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Question Bank access is required' using errcode = '42501';
  end if;
  return query
  with requested as (
    select variant.id as variant_id, variant.question_id
    from public.dp_qb_question_variants variant
    where variant.id = any(coalesce(p_variant_ids, array[]::uuid[]))
  ), links as (
    select requested.variant_id, requested.question_id, provenance.source_id,
           provenance.review_status, true as is_variant_source
    from requested
    join public.dp_qb_variant_sources provenance
      on provenance.variant_id = requested.variant_id
    where provenance.source_id is not null and provenance.review_status <> 'rejected'
    union all
    select requested.variant_id, requested.question_id, provenance.source_id,
           provenance.review_status, false
    from requested
    join public.dp_qb_question_sources provenance
      on provenance.question_id = requested.question_id
    where provenance.source_id is not null and provenance.review_status <> 'rejected'
  )
  select distinct links.variant_id, links.question_id,
         case when links.review_status = 'reviewed' then source.slug else 'unknown' end,
         case when links.review_status = 'reviewed' then source.display_name else 'Source attribution under review' end,
         case when links.review_status = 'reviewed' then source.short_label else 'Under review' end,
         case when links.review_status = 'reviewed' then source.attribution_label else 'Source' end,
         case when links.review_status = 'reviewed' then source.display_order else 9990 end,
         links.review_status, links.is_variant_source
  from links
  join public.dp_content_sources source on source.id = links.source_id
  where source.is_active
  order by links.variant_id, links.is_variant_source desc, 7, 4;
end;
$$;

revoke execute on function public.dp_qb_public_sources_for_variants(uuid[])
  from public, anon;
grant execute on function public.dp_qb_public_sources_for_variants(uuid[])
  to authenticated, service_role;

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
  select source.slug, source.display_name, source.short_label,
         source.attribution_label, source.display_order,
         (select count(distinct variant_source.variant_id)
          from public.dp_qb_variant_sources variant_source
          where variant_source.source_id = source.id
            and variant_source.review_status = 'reviewed')::bigint,
         (select count(distinct assignment.drive_file_id)
          from public.dp_resource_source_assignments assignment
          join public.dp_resource_index index_row on index_row.drive_file_id = assignment.drive_file_id
          where assignment.source_id = source.id
            and assignment.review_status = 'reviewed')::bigint
  from public.dp_content_sources source
  where source.is_active
  order by source.display_order, source.display_name;
end;
$$;

revoke execute on function public.dp_content_source_options() from public, anon;
grant execute on function public.dp_content_source_options() to authenticated, service_role;

create or replace function public.dp_qb_source_options_for_course(p_course_id uuid)
returns table (
  slug text, display_name text, short_label text, attribution_label text,
  display_order integer, eligible_variant_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.dp_qb_has_access() then
    raise exception 'Member access is required' using errcode = '42501';
  end if;
  return query
  select source.slug, source.display_name, source.short_label,
         source.attribution_label, source.display_order,
         count(distinct provenance.variant_id)::bigint
  from public.dp_content_sources source
  join public.dp_qb_variant_sources provenance on provenance.source_id = source.id
  join public.dp_qb_question_variants variant on variant.id = provenance.variant_id
  where source.is_active
    and provenance.review_status = 'reviewed'
    and variant.render_status = 'ready'
    and variant.course_id = p_course_id
  group by source.id
  having count(distinct provenance.variant_id) > 0
  order by source.display_order, source.display_name;
end;
$$;

revoke execute on function public.dp_qb_source_options_for_course(uuid) from public, anon;
grant execute on function public.dp_qb_source_options_for_course(uuid) to authenticated, service_role;

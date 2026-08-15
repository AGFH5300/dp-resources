-- Restore Library navigation folders as an internal, low-priority source
-- classification without exposing "Library structure" in the public source UI.
--
-- The August source-review migration correctly classified unresolved folders as
-- Library structure. A later cleanup rejected those structural assignments when
-- the public Library structure source tab was removed, which made the older
-- unknown/under-review fallback effective again. Keep the UI category hidden,
-- but preserve the internal classification.

update public.dp_content_sources
set is_active = false,
    updated_at = now()
where slug = 'library_structure';

-- Add a low-priority reviewed structural fallback for every folder that is
-- currently effective as unknown. Because assignment_method='unresolved' has
-- the lowest precedence, any real reviewed provider assignment/inheritance
-- (Official IB, Save My Exams, RevisionDojo, etc.) continues to win.
insert into public.dp_resource_source_assignments (
  drive_file_id,
  source_id,
  is_primary,
  relationship,
  assignment_method,
  confidence,
  inherited_from_drive_file_id,
  review_status,
  applies_to_descendants,
  resolution_version,
  backfill_version,
  last_resolved_at,
  created_by,
  updated_at
)
select distinct
  catalog.drive_file_id,
  structure.id,
  true,
  'primary',
  'unresolved',
  1,
  null,
  'reviewed',
  false,
  'library_structure_fallback_v1',
  'library_structure_fallback_v1',
  now(),
  null,
  now()
from public.dp_resource_source_catalog catalog
cross join public.dp_content_sources structure
where catalog.is_folder
  and catalog.source_slug = 'unknown'
  and structure.slug = 'library_structure'
on conflict (
  drive_file_id,
  source_id,
  assignment_method,
  (coalesce(inherited_from_drive_file_id, ''::text)),
  relationship
) do update set
  is_primary = true,
  confidence = 1,
  review_status = 'reviewed',
  applies_to_descendants = false,
  resolution_version = 'library_structure_fallback_v1',
  backfill_version = 'library_structure_fallback_v1',
  last_resolved_at = now(),
  updated_at = now();

-- Preserve the old unknown rows as audit history but stop them from being
-- effective for folders that now have the structural fallback.
update public.dp_resource_source_assignments assignment
set review_status = 'rejected',
    applies_to_descendants = false,
    resolution_version = 'superseded_by_library_structure_fallback_v1',
    last_resolved_at = now(),
    updated_at = now()
from public.dp_resource_index index_row,
     public.dp_content_sources unknown_source
where assignment.drive_file_id = index_row.drive_file_id
  and index_row.is_folder
  and assignment.source_id = unknown_source.id
  and unknown_source.slug = 'unknown'
  and assignment.review_status <> 'rejected'
  and exists (
    select 1
    from public.dp_resource_source_assignments structure_assignment
    join public.dp_content_sources structure_source
      on structure_source.id = structure_assignment.source_id
     and structure_source.slug = 'library_structure'
    where structure_assignment.drive_file_id = assignment.drive_file_id
      and structure_assignment.assignment_method = 'unresolved'
      and structure_assignment.review_status = 'reviewed'
  );

-- Future indexing must use Library structure (reviewed, inactive/public-hidden)
-- as the fallback for folders, while files continue to use the genuine
-- unknown/under-review source until evidence is available.
create or replace function public.dp_seed_resource_attribution(p_drive_file_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.dp_resource_source_assignments (
    drive_file_id,
    source_id,
    is_primary,
    relationship,
    assignment_method,
    confidence,
    inherited_from_drive_file_id,
    review_status,
    applies_to_descendants,
    resolution_version,
    backfill_version,
    last_resolved_at,
    created_by,
    updated_at
  )
  select
    index_row.drive_file_id,
    source.id,
    true,
    'primary',
    'unresolved',
    case when index_row.is_folder then 1 else null end,
    null,
    case when index_row.is_folder then 'reviewed' else 'under_review' end,
    false,
    case when index_row.is_folder then 'library_structure_fallback_v1' else null end,
    'index_sync_v2',
    now(),
    null,
    now()
  from public.dp_resource_index index_row
  join public.dp_content_sources source
    on source.slug = case
      when index_row.is_folder then 'library_structure'
      else 'unknown'
    end
  where index_row.drive_file_id = any(coalesce(p_drive_file_ids, array[]::text[]))
  on conflict (
    drive_file_id,
    source_id,
    assignment_method,
    (coalesce(inherited_from_drive_file_id, ''::text)),
    relationship
  ) do nothing;

  insert into public.dp_resource_type_assignments (
    drive_file_id, resource_type_id, assignment_method, review_status,
    backfill_version
  )
  select index_row.drive_file_id, resource_type.id, 'unresolved', 'under_review',
         'index_sync_v2'
  from public.dp_resource_index index_row
  join public.dp_resource_types resource_type on resource_type.slug = 'needs_review'
  where index_row.drive_file_id = any(coalesce(p_drive_file_ids, array[]::text[]))
    and not index_row.is_folder
  on conflict (drive_file_id) do nothing;

  update public.dp_resource_type_assignments assignment
  set resource_type_id = resource_type.id,
      assignment_method = 'reviewed_filename_rule',
      confidence = 1,
      review_status = 'reviewed',
      rule_key = match.rule_key,
      updated_at = now()
  from public.dp_resource_index index_row
  join lateral (
    select case
      when lower(index_row.name) ~ '(^|[^a-z])mark[ _-]?scheme([^a-z]|$)' then 'markscheme'
      when lower(index_row.name) ~ '(^|[^a-z])question[ _-]?paper([^a-z]|$)' then 'question_paper'
      when lower(index_row.name) ~ '(^|[^a-z])cheat[ _-]?sheet([^a-z]|$)' then 'cheatsheet'
      when lower(index_row.name) ~ '(^|[^a-z])formula[ _-]?booklet([^a-z]|$)' then 'formula_booklet'
      when index_row.mime_type like 'video/%' then 'video'
      when index_row.mime_type like 'audio/%' then 'audio'
      else null end as type_slug,
    case
      when lower(index_row.name) ~ '(^|[^a-z])mark[ _-]?scheme([^a-z]|$)' then 'filename_markscheme_v1'
      when lower(index_row.name) ~ '(^|[^a-z])question[ _-]?paper([^a-z]|$)' then 'filename_question_paper_v1'
      when lower(index_row.name) ~ '(^|[^a-z])cheat[ _-]?sheet([^a-z]|$)' then 'filename_cheatsheet_v1'
      when lower(index_row.name) ~ '(^|[^a-z])formula[ _-]?booklet([^a-z]|$)' then 'filename_formula_booklet_v1'
      when index_row.mime_type like 'video/%' then 'mime_video_v1'
      when index_row.mime_type like 'audio/%' then 'mime_audio_v1'
      else null end as rule_key
  ) match on match.type_slug is not null
  join public.dp_resource_types resource_type on resource_type.slug = match.type_slug
  where assignment.drive_file_id = index_row.drive_file_id
    and index_row.drive_file_id = any(coalesce(p_drive_file_ids, array[]::text[]))
    and assignment.assignment_method = 'unresolved';
end;
$$;

revoke execute on function public.dp_seed_resource_attribution(text[])
  from public, anon, authenticated;
grant execute on function public.dp_seed_resource_attribution(text[])
  to service_role;

-- Safety assertions: structure is a folder-only internal fallback and must stay
-- out of the public source list.
do $$
begin
  if exists (
    select 1
    from public.dp_content_sources
    where slug = 'library_structure' and is_active
  ) then
    raise exception 'Library structure must remain inactive/public-hidden';
  end if;

  if exists (
    select 1
    from public.dp_resource_source_catalog
    where is_folder and source_slug = 'unknown'
  ) then
    raise exception 'Structural folder fix left folders under source review';
  end if;

  if exists (
    select 1
    from public.dp_resource_source_catalog
    where not is_folder and source_slug = 'library_structure'
  ) then
    raise exception 'Library structure fallback was incorrectly applied to files';
  end if;

  insert into public.dp_content_source_audit_log (
    actor_user_id,
    target_kind,
    target_id,
    action,
    before_state,
    after_state,
    change_version
  ) values (
    null,
    'resource_library',
    'library',
    'restore_internal_library_structure_fallback',
    jsonb_build_object('reason', 'structural folders incorrectly fell back to source under review'),
    jsonb_build_object('folderFallback', 'library_structure', 'publiclyVisible', false),
    'library_structure_fallback_v1'
  );
end;
$$;

-- Keep the cached admin source audit consistent with the corrected effective
-- assignments.
select public.dp_admin_refresh_content_source_audit();

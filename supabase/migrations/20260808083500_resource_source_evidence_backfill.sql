-- Reviewed Resource Library source/provider evidence backfill.
--
-- Evidence is intentionally conservative. It uses only provider-branded content,
-- reviewed collection patterns, the Resource Library manifest, or explicit school/
-- official filenames. Ambiguous textbooks, student work, IA/EE samples and mixed
-- learning-resource folders remain under review rather than being guessed.
--
-- This migration does not move, rename, copy, replace or delete Google Drive files.
-- Existing unresolved rows are retained as provenance. Reviewed assignments outrank
-- them through dp_resource_effective_source_assignments.

do $$
declare
  v_version constant text := 'resource_source_evidence_v3';
begin
  -- Additional sources verified from the current Drive corpus / reviewed manifest.
  insert into public.dp_content_sources (
    slug, display_name, short_label, description, source_category,
    attribution_label, website_url, display_order, is_active
  ) values
    ('revisiondojo', 'RevisionDojo', 'RevisionDojo',
     'Collection/provider identified from explicit RevisionDojo branding in reviewed Library files.',
     'collection', 'Source', null, 55, true),
    ('christos_nikolaidis', 'Christos Nikolaidis', 'Christos Nikolaidis',
     'Creator/source identified from explicit author credits and the reviewed Resource Library manifest.',
     'creator', 'Source', null, 56, true),
    ('brilliant_learning', 'Brilliant Learning', 'Brilliant Learning',
     'Collection/provider identified from the reviewed IB Physics practice-material catalogue and matching Library collection.',
     'collection', 'Source', null, 57, true),
    ('padlet', 'Padlet', 'Padlet',
     'Hosted collection identified only where the Library item itself explicitly records Padlet provenance.',
     'collection', 'Hosted from', null, 58, true)
  on conflict (slug) do update set
    display_name = excluded.display_name,
    short_label = excluded.short_label,
    description = excluded.description,
    source_category = excluded.source_category,
    attribution_label = excluded.attribution_label,
    display_order = excluded.display_order,
    is_active = true,
    updated_at = now();

  insert into public.dp_content_source_aliases (source_id, alias, alias_key)
  select source.id, alias.alias, alias.alias_key
  from (values
    ('revisiondojo', 'RevisionDojo', 'revisiondojo'),
    ('christos_nikolaidis', 'Christos Nikolaidis', 'christosnikolaidis'),
    ('brilliant_learning', 'Brilliant Learning', 'brilliantlearning'),
    ('padlet', 'Padlet', 'padlet')
  ) as alias(source_slug, alias, alias_key)
  join public.dp_content_sources source on source.slug = alias.source_slug
  on conflict (alias_key) do update set
    source_id = excluded.source_id,
    alias = excluded.alias;

  -- If this exact backfill version is re-applied during development, retire its
  -- prior explicit rows before rebuilding them. Rejected rows remain audit history.
  update public.dp_resource_source_assignments
  set review_status = 'rejected',
      applies_to_descendants = false,
      updated_at = now(),
      last_resolved_at = now()
  where backfill_version = v_version
    and assignment_method = 'import_manifest'
    and review_status <> 'rejected';

  -- Reviewed recursive collection roots. These are intentionally keyed by the
  -- actual indexed folder name plus subject/path context where a folder label is
  -- not globally unique (Study Materials / Mock Papers).
  with roots as (
    select index_row.drive_file_id,
           case
             when lower(index_row.name) = 'past papers' then 'ib_official'
             when lower(index_row.name) = 'specimen papers' then 'ib_official'
             when lower(index_row.name) = 'guides and syllabus' then 'ib_official'
             when lower(index_row.name) = 'formula & data booklets' then 'ib_official'
             when lower(index_row.name) = 'notes' then 'save_my_exams'
             when lower(index_row.name) = 'cheatsheets' then 'revisiondojo'
             when lower(index_row.name) = 'study materials'
               and index_row.path like 'Library / Group 5 - Math / Math AA /%'
               then 'christos_nikolaidis'
             when lower(index_row.name) = 'study materials'
               and index_row.path like 'Library / Group 5 - Math / Math AI /%'
               then 'christos_nikolaidis'
             when lower(index_row.name) = 'mock papers'
               and index_row.path like 'Library / Group 5 - Math / Math AA /%'
               then 'christos_nikolaidis'
             when lower(index_row.name) = 'mock papers'
               and index_row.path like 'Library / Group 5 - Math / Math AI /%'
               then 'revisiondojo'
             when lower(index_row.name) = 'study materials'
               and index_row.path like 'Library / Group 4 - Sciences / Physics /%'
               then 'brilliant_learning'
             else null
           end as source_slug
    from public.dp_resource_index index_row
    where index_row.is_folder
  )
  insert into public.dp_resource_source_assignments (
    drive_file_id, source_id, is_primary, relationship, assignment_method,
    confidence, inherited_from_drive_file_id, review_status,
    applies_to_descendants, resolution_version, backfill_version,
    last_resolved_at, created_by, updated_at
  )
  select roots.drive_file_id, source.id, true, 'primary', 'import_manifest',
         1, null, 'reviewed', true, v_version, v_version, now(), null, now()
  from roots
  join public.dp_content_sources source on source.slug = roots.source_slug
  where roots.source_slug is not null
  on conflict (
    drive_file_id, source_id, assignment_method,
    (coalesce(inherited_from_drive_file_id, ''::text)), relationship
  ) do update set
    is_primary = true,
    confidence = 1,
    review_status = 'reviewed',
    applies_to_descendants = true,
    resolution_version = excluded.resolution_version,
    backfill_version = excluded.backfill_version,
    last_resolved_at = now(),
    updated_at = now();

  -- High-confidence direct-file evidence. These explicit import-manifest rows
  -- outrank inherited folder assignments, so a DIA/school file inside a provider
  -- folder cannot accidentally inherit that provider label.
  with files as (
    select index_row.drive_file_id,
           case
             -- Explicit hosted provenance in the current filename.
             when lower(index_row.name) like '%padlet%' then 'padlet'

             -- DP Resources' own Resource Library manifest/index workbook.
             when index_row.name = 'IB Revision Resource Library.xlsx' then 'dp_resources'

             -- Explicit official-IB material outside the standard official folders.
             when lower(index_row.path) like 'library / grade boundaries /%'
               or lower(index_row.name) like 'grade boundaries%'
               then 'ib_official'
             when lower(index_row.name) like '%subject guide%'
               and lower(index_row.name) like '%ib%'
               then 'ib_official'
             when lower(index_row.name) like 'language a language and literature guide%'
               then 'ib_official'
             when lower(index_row.name) in (
               'dp vis arts subjectbrief en 1.pdf',
               'dp visual arts assessment criteria en.pdf'
             ) then 'ib_official'
             when lower(index_row.name) like '%visual arts%'
               and lower(index_row.name) like '%tsm%'
               then 'ib_official'

             -- Explicit school-managed / school-created filenames and planning docs.
             when lower(index_row.name) like '%dia %'
               or lower(index_row.name) like 'dia %'
               or lower(index_row.name) like '%course outline%'
               or lower(index_row.name) like '%course overview%'
               or lower(index_row.name) like '%programme overview%'
               or lower(index_row.name) like '%curriculum overview%'
               or lower(index_row.name) like '%curriculum outline%'
               or lower(index_row.name) like '%curriculum map%'
               or lower(index_row.name) like '%curriculm map%'
               or lower(index_row.name) like '%subject outline%'
               or lower(index_row.name) like '%formative assessment%'
               or lower(index_row.name) like '%summative assessment%'
               or lower(index_row.name) like '%scheme of work%'
               or lower(index_row.name) like '%topics for year 12%'
               or lower(index_row.name) like '%topics covered in year 12%'
               or lower(index_row.name) like '%dp student workbook%'
               or lower(index_row.name) like '%summer pack%'
               then 'school'
             else null
           end as source_slug
    from public.dp_resource_index index_row
    where not index_row.is_folder
  )
  insert into public.dp_resource_source_assignments (
    drive_file_id, source_id, is_primary, relationship, assignment_method,
    confidence, inherited_from_drive_file_id, review_status,
    applies_to_descendants, resolution_version, backfill_version,
    last_resolved_at, created_by, updated_at
  )
  select files.drive_file_id, source.id, true, 'primary', 'import_manifest',
         1, null, 'reviewed', false, v_version, v_version, now(), null, now()
  from files
  join public.dp_content_sources source on source.slug = files.source_slug
  where files.source_slug is not null
  on conflict (
    drive_file_id, source_id, assignment_method,
    (coalesce(inherited_from_drive_file_id, ''::text)), relationship
  ) do update set
    is_primary = true,
    confidence = 1,
    review_status = 'reviewed',
    applies_to_descendants = false,
    resolution_version = excluded.resolution_version,
    backfill_version = excluded.backfill_version,
    last_resolved_at = now(),
    updated_at = now();

  -- Rebuild inherited descendants from all reviewed recursive roots, including
  -- any future manual/admin roots that already exist.
  perform public.dp_resolve_resource_source_inheritance(v_version);

  insert into public.dp_content_source_audit_log (
    actor_user_id, target_kind, target_id, action,
    before_state, after_state, change_version
  ) values (
    null,
    'resource_library',
    'library',
    'evidence_source_backfill',
    jsonb_build_object(
      'priorUnresolvedRows', 16916,
      'evidencePolicy', 'provider-branded content, reviewed collection patterns, manifest evidence, explicit official/school filenames'
    ),
    jsonb_build_object(
      'reviewedEffectiveFiles', (
        select count(distinct effective.drive_file_id)
        from public.dp_resource_effective_source_assignments effective
        join public.dp_resource_index index_row on index_row.drive_file_id = effective.drive_file_id
        where effective.review_status = 'reviewed' and not index_row.is_folder
      ),
      'reviewedEffectiveFolders', (
        select count(distinct effective.drive_file_id)
        from public.dp_resource_effective_source_assignments effective
        join public.dp_resource_index index_row on index_row.drive_file_id = effective.drive_file_id
        where effective.review_status = 'reviewed' and index_row.is_folder
      ),
      'remainingUnderReviewFiles', (
        select count(*)
        from public.dp_resource_index index_row
        where not index_row.is_folder
          and not exists (
            select 1 from public.dp_resource_effective_source_assignments effective
            where effective.drive_file_id = index_row.drive_file_id
              and effective.review_status = 'reviewed'
          )
      )
    ),
    v_version
  );
end;
$$;

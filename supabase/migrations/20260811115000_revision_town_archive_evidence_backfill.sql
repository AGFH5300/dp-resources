-- Review the only remaining legacy Question Bank source rows using the
-- independently supplied and internally verified Revision Town import report.
--
-- This migration changes provenance metadata only. It deliberately guards the
-- exact import batch, archive hash and row counts before making any assignment.

create temporary table _dp_revision_town_protected_counts on commit drop as
select
  (select count(*) from public.dp_qb_questions) as question_cores,
  (select count(*) from public.dp_qb_question_variants) as variants,
  (select count(*) from public.dp_qb_assets) as assets,
  (select count(*) from public.dp_qb_solution_videos) as solution_videos,
  (select count(*) from public.dp_qb_user_progress) as progress_rows,
  (select count(*) from public.dp_qb_user_saved_questions) as saved_rows,
  (select count(*) from public.dp_resource_index) as resource_index_rows,
  (select count(*) from public.dp_resource_source_assignments) as resource_source_rows;

do $$
declare
  v_version constant text := 'revision_town_archive_evidence_v1';
  v_archive_identifier constant text := 'processed-20260721-222121';
  v_archive_sha256 constant text := 'e91b6f5752b67626b278b34858ff0f11444bcb11bf0324e4cba1a5edad14a64d';
  v_summary_sha256 constant text := '0b403eaa91034571109247ec6255224135b6cadc175a2c4a249726a3c9623e9e';
  v_expected_variants constant bigint := 12212;
  v_expected_questions constant bigint := 5135;
  v_batch public.dp_qb_import_batches%rowtype;
  v_revision_town_source_id uuid;
  v_unknown_variants bigint;
  v_unknown_questions bigint;
  v_revision_town_variants bigint;
  v_revision_town_questions bigint;
  v_updated_variants bigint;
  v_updated_questions bigint;
  v_before_state jsonb;
begin
  select *
  into strict v_batch
  from public.dp_qb_import_batches batch
  where batch.archive_identifier = v_archive_identifier
    and batch.status = 'completed'
    and batch.verification_status = 'passed';

  if v_batch.archive_sha256 <> v_archive_sha256
     or v_batch.importer_version <> '1.0.0'
     or v_batch.mode <> 'all'
     or coalesce((v_batch.expected_counts ->> 'variants')::bigint, -1) <> v_expected_variants
     or coalesce((v_batch.actual_counts ->> 'variants')::bigint, -1) <> v_expected_variants
     or coalesce((v_batch.expected_counts ->> 'questionCores')::bigint, -1) <> v_expected_questions
     or coalesce((v_batch.actual_counts ->> 'questionCores')::bigint, -1) <> v_expected_questions then
    raise exception 'Revision Town import evidence does not match the verified batch';
  end if;

  select source.id
  into strict v_revision_town_source_id
  from public.dp_content_sources source
  where source.slug = 'revision_town'
    and source.is_active;

  select count(*) into v_unknown_variants
  from public.dp_qb_variant_sources provenance
  where provenance.created_by_batch_id = v_batch.id
    and provenance.provider = 'unknown'
    and provenance.assignment_method = 'review_needed_backfill'
    and provenance.review_status = 'under_review';

  select count(*) into v_unknown_questions
  from public.dp_qb_question_sources provenance
  where provenance.created_by_batch_id = v_batch.id
    and provenance.provider = 'unknown'
    and provenance.assignment_method = 'review_needed_backfill'
    and provenance.review_status = 'under_review';

  select count(*) into v_revision_town_variants
  from public.dp_qb_variant_sources provenance
  where provenance.created_by_batch_id = v_batch.id
    and provenance.provider = 'revision_town'
    and provenance.source_id = v_revision_town_source_id
    and provenance.review_status = 'reviewed';

  select count(*) into v_revision_town_questions
  from public.dp_qb_question_sources provenance
  where provenance.created_by_batch_id = v_batch.id
    and provenance.provider = 'revision_town'
    and provenance.source_id = v_revision_town_source_id
    and provenance.review_status = 'reviewed';

  -- A replay after a successful application is safe and does not duplicate the
  -- aggregate audit record.
  if v_unknown_variants = 0
     and v_unknown_questions = 0
     and v_revision_town_variants = v_expected_variants
     and v_revision_town_questions = v_expected_questions then
    return;
  end if;

  if v_unknown_variants <> v_expected_variants
     or v_unknown_questions <> v_expected_questions
     or v_revision_town_variants <> 0
     or v_revision_town_questions <> 0
     or exists (
       select 1
       from public.dp_qb_variant_sources provenance
       where provenance.created_by_batch_id = v_batch.id
         and not (
           provenance.provider = 'unknown'
           and provenance.assignment_method = 'review_needed_backfill'
           and provenance.review_status = 'under_review'
         )
     )
     or exists (
       select 1
       from public.dp_qb_question_sources provenance
       where provenance.created_by_batch_id = v_batch.id
         and not (
           provenance.provider = 'unknown'
           and provenance.assignment_method = 'review_needed_backfill'
           and provenance.review_status = 'under_review'
         )
     ) then
    raise exception 'Revision Town source rows no longer match the reviewed evidence boundary';
  end if;

  if exists (
    select 1 from public.dp_qb_variant_sources provenance
    where provenance.provider = 'revision_town'
      and provenance.review_status <> 'rejected'
  ) or exists (
    select 1 from public.dp_qb_question_sources provenance
    where provenance.provider = 'revision_town'
      and provenance.review_status <> 'rejected'
  ) then
    raise exception 'Unexpected pre-existing Revision Town source rows';
  end if;

  v_before_state := jsonb_build_object(
    'archiveIdentifier', v_archive_identifier,
    'batchId', v_batch.id,
    'unknownVariantRows', v_unknown_variants,
    'unknownQuestionRows', v_unknown_questions
  );

  update public.dp_qb_variant_sources provenance
  set provider = 'revision_town',
      source_id = v_revision_town_source_id,
      assignment_method = 'import_manifest',
      review_status = 'reviewed',
      reviewed_at = now(),
      source_metadata = coalesce(provenance.source_metadata, '{}'::jsonb) || jsonb_build_object(
        'backfillVersion', v_version,
        'evidenceArchiveIdentifier', v_archive_identifier,
        'evidenceArchiveSha256', v_archive_sha256,
        'evidenceSummarySha256', v_summary_sha256,
        'sourceCapture', 'revisiontown2024.pages.dev'
      ),
      updated_at = now()
  where provenance.created_by_batch_id = v_batch.id
    and provenance.provider = 'unknown'
    and provenance.assignment_method = 'review_needed_backfill'
    and provenance.review_status = 'under_review';
  get diagnostics v_updated_variants = row_count;

  update public.dp_qb_question_sources provenance
  set provider = 'revision_town',
      source_id = v_revision_town_source_id,
      assignment_method = 'import_manifest',
      review_status = 'reviewed',
      reviewed_at = now(),
      source_metadata = coalesce(provenance.source_metadata, '{}'::jsonb) || jsonb_build_object(
        'backfillVersion', v_version,
        'evidenceArchiveIdentifier', v_archive_identifier,
        'evidenceArchiveSha256', v_archive_sha256,
        'evidenceSummarySha256', v_summary_sha256,
        'sourceCapture', 'revisiontown2024.pages.dev'
      ),
      updated_at = now()
  where provenance.created_by_batch_id = v_batch.id
    and provenance.provider = 'unknown'
    and provenance.assignment_method = 'review_needed_backfill'
    and provenance.review_status = 'under_review';
  get diagnostics v_updated_questions = row_count;

  if v_updated_variants <> v_expected_variants
     or v_updated_questions <> v_expected_questions then
    raise exception 'Revision Town source update count mismatch: variants %, questions %',
      v_updated_variants, v_updated_questions;
  end if;

  if (select count(*) from public.dp_qb_variant_sources provenance
      where provenance.created_by_batch_id = v_batch.id
        and provenance.provider = 'revision_town'
        and provenance.source_id = v_revision_town_source_id
        and provenance.assignment_method = 'import_manifest'
        and provenance.review_status = 'reviewed'
        and provenance.source_metadata ->> 'backfillVersion' = v_version) <> v_expected_variants
     or (select count(*) from public.dp_qb_question_sources provenance
         where provenance.created_by_batch_id = v_batch.id
           and provenance.provider = 'revision_town'
           and provenance.source_id = v_revision_town_source_id
           and provenance.assignment_method = 'import_manifest'
           and provenance.review_status = 'reviewed'
           and provenance.source_metadata ->> 'backfillVersion' = v_version) <> v_expected_questions then
    raise exception 'Revision Town post-update verification failed';
  end if;

  insert into public.dp_content_source_audit_log (
    target_kind, target_id, action, before_state, after_state, change_version
  ) values (
    'question_bank_import_batch', v_batch.id::text, 'review_source_evidence',
    v_before_state,
    jsonb_build_object(
      'sourceSlug', 'revision_town',
      'reviewStatus', 'reviewed',
      'variantRows', v_updated_variants,
      'questionRows', v_updated_questions,
      'archiveIdentifier', v_archive_identifier,
      'archiveSha256', v_archive_sha256,
      'evidenceSummarySha256', v_summary_sha256
    ),
    v_version
  );
end;
$$;

do $$
declare
  v_before record;
begin
  select * into strict v_before from _dp_revision_town_protected_counts;

  if v_before.question_cores <> (select count(*) from public.dp_qb_questions)
     or v_before.variants <> (select count(*) from public.dp_qb_question_variants)
     or v_before.assets <> (select count(*) from public.dp_qb_assets)
     or v_before.solution_videos <> (select count(*) from public.dp_qb_solution_videos)
     or v_before.progress_rows <> (select count(*) from public.dp_qb_user_progress)
     or v_before.saved_rows <> (select count(*) from public.dp_qb_user_saved_questions)
     or v_before.resource_index_rows <> (select count(*) from public.dp_resource_index)
     or v_before.resource_source_rows <> (select count(*) from public.dp_resource_source_assignments) then
    raise exception 'Protected content or user-state counts changed during Revision Town source review';
  end if;
end;
$$;

analyze public.dp_qb_question_sources;
analyze public.dp_qb_variant_sources;

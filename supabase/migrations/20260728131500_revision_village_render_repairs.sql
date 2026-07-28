-- Recognize deduplicated source aliases and the four curated source-image
-- fallbacks used by the production Question Bank renderer. This prevents the
-- render audit from re-quarantining questions that are now safely renderable.

create or replace function private.dp_qb_variant_render_issue_codes(p_variant_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with variant_question as (
    select
      variant.id as variant_id,
      question.content,
      question.mark_scheme,
      question.examiner_report
    from public.dp_qb_question_variants variant
    join public.dp_qb_questions question on question.id = variant.question_id
    where variant.id = p_variant_id
  ),
  source_fields as (
    select variant_id, 'question'::text as role, coalesce(content, '') as source
    from variant_question
    union all
    select variant_id, 'markscheme', coalesce(mark_scheme, '')
    from variant_question
    union all
    select variant_id, 'examiner_report', coalesce(examiner_report, '')
    from variant_question
  ),
  referenced_images as (
    select
      source_fields.variant_id,
      source_fields.role,
      (image_match)[1]::uuid as source_file_id
    from source_fields
    cross join lateral regexp_matches(
      source_fields.source,
      'question:([0-9a-fA-F-]{36})',
      'g'
    ) as image_match
  ),
  curated_fallbacks(source_file_id) as (
    values
      ('d8591cfe-c657-4825-868b-73faf4717afe'::uuid),
      ('d1b6e570-d496-4d18-be0d-334c2eb6f610'::uuid),
      ('2dc1e4ff-51a6-483d-a2b0-a87717452ccd'::uuid),
      ('25599f25-fda4-4c8b-a984-af11e9f0b9e6'::uuid)
  ),
  issues as (
    select 'blank_question_content'::text as issue
    from variant_question
    where btrim(coalesce(content, '')) = ''

    union all

    select 'protected_render_token_leak'
    from variant_question
    where content like '%DPQBPROTECTEDTOKEN%'
       or mark_scheme like '%DPQBPROTECTEDTOKEN%'
       or examiner_report like '%DPQBPROTECTEDTOKEN%'

    union all

    select 'missing_' || referenced_images.role || '_image'
    from referenced_images
    where not exists (
      select 1
      from curated_fallbacks
      where curated_fallbacks.source_file_id = referenced_images.source_file_id
    )
      and not exists (
        select 1
        from public.dp_qb_asset_sources asset_source
        join public.dp_qb_variant_assets variant_asset
          on variant_asset.variant_id = referenced_images.variant_id
         and variant_asset.asset_id = asset_source.asset_id
        where asset_source.source_file_id = referenced_images.source_file_id
      )

    union all

    select 'unverified_' || referenced_images.role || '_image'
    from referenced_images
    where not exists (
      select 1
      from curated_fallbacks
      where curated_fallbacks.source_file_id = referenced_images.source_file_id
    )
      and exists (
        select 1
        from public.dp_qb_asset_sources asset_source
        join public.dp_qb_variant_assets variant_asset
          on variant_asset.variant_id = referenced_images.variant_id
         and variant_asset.asset_id = asset_source.asset_id
        join public.dp_qb_assets asset on asset.id = variant_asset.asset_id
        where asset_source.source_file_id = referenced_images.source_file_id
          and (
            asset.upload_status <> 'uploaded'
            or asset.verification_status <> 'verified'
          )
      )
      and not exists (
        select 1
        from public.dp_qb_asset_sources asset_source
        join public.dp_qb_variant_assets variant_asset
          on variant_asset.variant_id = referenced_images.variant_id
         and variant_asset.asset_id = asset_source.asset_id
        join public.dp_qb_assets asset on asset.id = variant_asset.asset_id
        where asset_source.source_file_id = referenced_images.source_file_id
          and asset.upload_status = 'uploaded'
          and asset.verification_status = 'verified'
      )
  )
  select coalesce(
    array_agg(distinct issues.issue order by issues.issue),
    array[]::text[]
  )
  from issues;
$$;

revoke all on function private.dp_qb_variant_render_issue_codes(uuid) from public;

-- Re-audit only the variants identified by the exhaustive Revision Village
-- production audit. The audit function decides their final status; this does
-- not blindly force them to ready.
do $audit_repaired_revision_village$
declare
  variant_id uuid;
begin
  foreach variant_id in array array[
    'fcd09cc8-6e13-5816-a79d-073a562d5b75'::uuid,
    '737d883d-a559-58fb-9c4e-99f12619d068'::uuid,
    'c35e5e45-af8f-5b77-a524-e17007cea2f1'::uuid,
    '38e98395-5da4-56e2-a97e-bb3b0fc3a192'::uuid,
    '8e5fbceb-b9dc-505c-bc64-34f3edadeacd'::uuid,
    '4738f3d9-bc6f-5e63-acee-0294be0815be'::uuid,
    '2760bb4d-9cad-5217-8055-84dec90e5f5c'::uuid,
    'd0a8a649-1c38-5a59-aed4-2755220c1d98'::uuid,
    'acda8af5-90bf-5c3c-aad0-833ed085258f'::uuid,
    '2cb5b0be-717d-534f-b90a-501dea0d401e'::uuid,
    'bb6e03e8-e754-5e29-b581-dce3bb1c27be'::uuid,
    '88cb43fb-2498-5a74-9367-bd6d8863131f'::uuid
  ]
  loop
    perform private.dp_qb_audit_variant(variant_id);
  end loop;
end
$audit_repaired_revision_village$;

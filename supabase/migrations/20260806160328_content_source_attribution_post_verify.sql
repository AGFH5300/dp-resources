-- Production verification found later-provider variants attached to legacy
-- question cores. The core-level legacy attribution is correct, but those
-- exact variants must display their own provider rather than inherit the
-- unresolved legacy occurrence source. Remove only rows created by v1.
create temporary table _dp_content_source_post_verify_counts on commit drop as
select
  (select count(*) from public.dp_qb_questions) question_cores,
  (select count(*) from public.dp_qb_question_variants) variants,
  (select count(*) from public.dp_qb_assets) assets,
  (select count(*) from public.dp_qb_solution_videos) videos,
  (select count(*) from public.dp_qb_user_progress) progress_rows,
  (select count(*) from public.dp_qb_user_saved_questions) saved_rows;

delete from public.dp_qb_variant_sources provenance
using public.dp_qb_question_variants variant,
      public.dp_content_sources source
where provenance.variant_id = variant.id
  and provenance.source_id = source.id
  and source.slug = 'unknown'
  and provenance.assignment_method = 'review_needed_backfill'
  and provenance.source_metadata ->> 'backfillVersion' = 'content_sources_v1'
  and nullif(variant.source_metadata ->> 'provider', '') is not null;

do $$
declare before_counts record;
begin
  select * into before_counts from _dp_content_source_post_verify_counts;
  if (select count(*) from public.dp_qb_questions) <> before_counts.question_cores
     or (select count(*) from public.dp_qb_question_variants) <> before_counts.variants
     or (select count(*) from public.dp_qb_assets) <> before_counts.assets
     or (select count(*) from public.dp_qb_solution_videos) <> before_counts.videos
     or (select count(*) from public.dp_qb_user_progress) <> before_counts.progress_rows
     or (select count(*) from public.dp_qb_user_saved_questions) <> before_counts.saved_rows then
    raise exception 'Post-verification provenance cleanup changed protected counts';
  end if;
  if exists (
    select 1
    from public.dp_qb_variant_sources provenance
    join public.dp_qb_question_variants variant on variant.id = provenance.variant_id
    join public.dp_content_sources source on source.id = provenance.source_id
    where source.slug = 'unknown'
      and provenance.assignment_method = 'review_needed_backfill'
      and provenance.source_metadata ->> 'backfillVersion' = 'content_sources_v1'
      and nullif(variant.source_metadata ->> 'provider', '') is not null
  ) then raise exception 'Later-provider variant retained legacy unknown attribution'; end if;
  if exists (
    select 1 from public.dp_qb_question_variants variant
    where variant.render_status = 'ready' and not exists (
      select 1 from public.dp_qb_variant_sources provenance
      where provenance.variant_id = variant.id and provenance.review_status <> 'rejected'
    )
  ) then raise exception 'Cleanup removed the only attribution state from a ready variant'; end if;
end;
$$;

-- Remove the final unavailable third-party image URLs from stored Question Bank content.
-- All remaining remote Markdown image references were verified to belong to failed
-- backfill rows, and their variants are quarantined with missing-image issue codes.

update public.dp_qb_questions q
set content = regexp_replace(
      q.content,
      '!\[[^]]*\]\(https?://[^)]*\)',
      ':span[Supporting image unavailable in the authorized archive.]',
      'g'
    )
where exists (
  select 1
  from public.dp_qb_remote_asset_backfill_stage_20260919 s
  where s.status = 'failed'
    and s.role = 'question'
    and s.question_id = q.id
);

update public.dp_qb_questions q
set mark_scheme = regexp_replace(
      q.mark_scheme,
      '!\[[^]]*\]\(https?://[^)]*\)',
      ':span[Supporting image unavailable in the authorized archive.]',
      'g'
    )
where exists (
  select 1
  from public.dp_qb_remote_asset_backfill_stage_20260919 s
  where s.status = 'failed'
    and s.role = 'markscheme'
    and s.question_id = q.id
);

drop function if exists public.dp_qb_claim_remote_asset_backfill_20260919(integer);
drop table if exists public.dp_qb_remote_asset_backfill_control_20260919;
drop table if exists public.dp_qb_remote_asset_backfill_stage_20260919;

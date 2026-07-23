-- Preserve examiner reports supplied by audited question-bank sources.

alter table public.dp_qb_questions
  add column if not exists examiner_report text not null default '';

alter table public.dp_qb_variant_assets
  drop constraint if exists dp_qb_variant_assets_role_check;

alter table public.dp_qb_variant_assets
  add constraint dp_qb_variant_assets_role_check
  check (role in ('question', 'markscheme', 'examiner_report', 'content_reference'));

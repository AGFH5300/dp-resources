create table public.dp_qb_remote_asset_backfill_stage_20260919 (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.dp_qb_questions(id) on delete cascade,
  role text not null check (role in ('question','markscheme')),
  source_url text not null,
  alt_text text not null default '',
  status text not null default 'pending' check (status in ('pending','complete','failed')),
  attempts integer not null default 0,
  asset_id uuid references public.dp_qb_assets(id) on delete set null,
  source_file_id uuid,
  last_error text,
  updated_at timestamptz not null default now(),
  unique(question_id, role, source_url)
);

alter table public.dp_qb_remote_asset_backfill_stage_20260919 enable row level security;
revoke all on table public.dp_qb_remote_asset_backfill_stage_20260919 from anon, authenticated;

insert into public.dp_qb_remote_asset_backfill_stage_20260919
  (question_id, role, source_url, alt_text)
select distinct q.id, 'question', match[2], coalesce(match[1], '')
from public.dp_qb_questions q
cross join lateral regexp_matches(
  q.content,
  '!\[([^]]*)\]\((https?://[^)[:space:]]+)\)',
  'g'
) as match
where q.content ~ '!\[[^]]*\]\(https?://'
on conflict do nothing;

insert into public.dp_qb_remote_asset_backfill_stage_20260919
  (question_id, role, source_url, alt_text)
select distinct q.id, 'markscheme', match[2], coalesce(match[1], '')
from public.dp_qb_questions q
cross join lateral regexp_matches(
  q.mark_scheme,
  '!\[([^]]*)\]\((https?://[^)[:space:]]+)\)',
  'g'
) as match
where q.mark_scheme ~ '!\[[^]]*\]\(https?://'
on conflict do nothing;

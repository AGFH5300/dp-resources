alter table public.dp_qb_remote_asset_backfill_stage_20260919
  drop constraint dp_qb_remote_asset_backfill_stage_20260919_status_check;

alter table public.dp_qb_remote_asset_backfill_stage_20260919
  add constraint dp_qb_remote_asset_backfill_stage_20260919_status_check
  check (status in ('pending','processing','complete','failed'));

create or replace function public.dp_qb_claim_remote_asset_backfill_20260919(p_limit integer default 100)
returns table (
  id uuid,
  question_id uuid,
  role text,
  source_url text,
  alt_text text,
  status text,
  attempts integer
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with claimed as (
    select s.id
    from public.dp_qb_remote_asset_backfill_stage_20260919 s
    where s.status = 'pending'
    order by s.question_id, s.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ),
  updated as (
    update public.dp_qb_remote_asset_backfill_stage_20260919 s
    set status = 'processing',
        attempts = s.attempts + 1,
        updated_at = now()
    from claimed c
    where s.id = c.id
    returning s.id, s.question_id, s.role, s.source_url, s.alt_text, s.status, s.attempts
  )
  select u.id, u.question_id, u.role, u.source_url, u.alt_text, u.status, u.attempts
  from updated u
  order by u.question_id, u.id;
$$;

revoke all on function public.dp_qb_claim_remote_asset_backfill_20260919(integer) from public, anon, authenticated;
grant execute on function public.dp_qb_claim_remote_asset_backfill_20260919(integer) to service_role;

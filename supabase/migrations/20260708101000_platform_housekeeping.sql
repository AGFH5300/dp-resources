-- Idempotent retention helpers. Apply after resource usage hardening.
-- Suggested Supabase cron, if pg_cron is enabled:
-- select cron.schedule('dp-platform-housekeeping', '17 3 * * *', $$select public.dp_run_platform_housekeeping();$$);
-- If cron is unavailable, call this from a trusted server-only maintenance/admin process.

create table if not exists public.dp_platform_housekeeping_runs (
  id integer primary key default 1 check (id = 1),
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);

revoke all on public.dp_platform_housekeeping_runs from anon, authenticated;

create or replace function public.dp_run_platform_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_rate integer := 0;
  v_diag integer := 0;
  v_usage integer := 0;
  v_stale integer := 0;
  v_last timestamptz;
begin
  if coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'not authorized';
  end if;

  select last_run_at into v_last from public.dp_platform_housekeeping_runs where id = 1 for update;
  if v_last is not null and v_last > now() - interval '12 hours' then
    return jsonb_build_object('skipped', true, 'last_run_at', v_last);
  end if;

  delete from public.dp_rate_limit_buckets where window_start < now() - interval '7 days';
  get diagnostics v_rate = row_count;

  delete from public.dp_server_error_events where occurred_at < now() - interval '90 days';
  get diagnostics v_diag = row_count;

  delete from public.dp_resource_usage_sessions where ended_at is not null and ended_at < now() - interval '12 months';
  get diagnostics v_usage = row_count;

  v_stale := public.dp_resource_usage_cleanup_stale(interval '10 minutes');

  insert into public.dp_platform_housekeeping_runs(id, last_run_at, updated_at)
  values(1, now(), now())
  on conflict (id) do update set last_run_at = excluded.last_run_at, updated_at = excluded.updated_at;

  return jsonb_build_object('skipped', false, 'rate_limit_buckets_deleted', v_rate, 'diagnostics_deleted', v_diag, 'closed_usage_sessions_deleted', v_usage, 'stale_usage_sessions_closed', v_stale);
end;
$$;

revoke execute on function public.dp_run_platform_housekeeping() from public, anon, authenticated;
grant execute on function public.dp_run_platform_housekeeping() to service_role;

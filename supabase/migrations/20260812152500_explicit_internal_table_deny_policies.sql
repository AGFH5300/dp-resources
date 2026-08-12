-- These tables are service-role only. Explicit deny policies document and
-- enforce that browser/session roles never read or write them.

drop policy if exists dp_content_source_audit_snapshot_deny_direct_access
  on public.dp_content_source_audit_snapshot;
create policy dp_content_source_audit_snapshot_deny_direct_access
  on public.dp_content_source_audit_snapshot
  for all
  to public
  using (false)
  with check (false);

drop policy if exists dp_platform_housekeeping_runs_deny_direct_access
  on public.dp_platform_housekeeping_runs;
create policy dp_platform_housekeeping_runs_deny_direct_access
  on public.dp_platform_housekeeping_runs
  for all
  to public
  using (false)
  with check (false);

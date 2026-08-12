-- Keep the exact admin audit fast in normal use while retaining a guarded
-- refresh path for source imports and administration changes.

create table if not exists public.dp_content_source_audit_snapshot (
  singleton boolean primary key default true check (singleton),
  audit jsonb not null,
  refreshed_at timestamptz not null default now(),
  dirty_at timestamptz
);

alter table public.dp_content_source_audit_snapshot enable row level security;
revoke all on table public.dp_content_source_audit_snapshot from public, anon, authenticated;
grant select, insert, update on table public.dp_content_source_audit_snapshot to service_role;

create or replace function public.dp_admin_refresh_content_source_audit()
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_audit jsonb;
begin
  v_audit := public.dp_admin_content_source_audit();

  insert into public.dp_content_source_audit_snapshot (
    singleton, audit, refreshed_at, dirty_at
  ) values (
    true, v_audit, clock_timestamp(), null
  )
  on conflict (singleton) do update set
    audit = excluded.audit,
    refreshed_at = excluded.refreshed_at,
    dirty_at = null;

  return v_audit;
end;
$$;

create or replace function public.dp_admin_content_source_audit_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select snapshot.audit || jsonb_build_object(
    'auditRefreshedAt', snapshot.refreshed_at,
    'auditDirty', snapshot.dirty_at is not null
  )
  from public.dp_content_source_audit_snapshot snapshot
  where snapshot.singleton;
$$;

create or replace function public.dp_mark_content_source_audit_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dp_content_source_audit_snapshot
  set dirty_at = coalesce(dirty_at, clock_timestamp())
  where singleton;
  return null;
end;
$$;

select public.dp_admin_refresh_content_source_audit();

drop trigger if exists dp_content_source_audit_dirty on public.dp_content_sources;
create trigger dp_content_source_audit_dirty
after insert or update or delete on public.dp_content_sources
for each statement execute function public.dp_mark_content_source_audit_dirty();

drop trigger if exists dp_qb_question_source_audit_dirty on public.dp_qb_question_sources;
create trigger dp_qb_question_source_audit_dirty
after insert or update or delete on public.dp_qb_question_sources
for each statement execute function public.dp_mark_content_source_audit_dirty();

drop trigger if exists dp_qb_variant_source_audit_dirty on public.dp_qb_variant_sources;
create trigger dp_qb_variant_source_audit_dirty
after insert or update or delete on public.dp_qb_variant_sources
for each statement execute function public.dp_mark_content_source_audit_dirty();

drop trigger if exists dp_qb_variant_audit_dirty on public.dp_qb_question_variants;
create trigger dp_qb_variant_audit_dirty
after insert or update or delete on public.dp_qb_question_variants
for each statement execute function public.dp_mark_content_source_audit_dirty();

drop trigger if exists dp_resource_source_audit_dirty on public.dp_resource_source_assignments;
create trigger dp_resource_source_audit_dirty
after insert or update or delete on public.dp_resource_source_assignments
for each statement execute function public.dp_mark_content_source_audit_dirty();

drop trigger if exists dp_resource_type_audit_dirty on public.dp_resource_type_assignments;
create trigger dp_resource_type_audit_dirty
after insert or update or delete on public.dp_resource_type_assignments
for each statement execute function public.dp_mark_content_source_audit_dirty();

revoke all on function public.dp_admin_refresh_content_source_audit() from public, anon, authenticated;
revoke all on function public.dp_admin_content_source_audit_snapshot() from public, anon, authenticated;
revoke all on function public.dp_mark_content_source_audit_dirty() from public, anon, authenticated;

grant execute on function public.dp_admin_refresh_content_source_audit() to service_role;
grant execute on function public.dp_admin_content_source_audit_snapshot() to service_role;

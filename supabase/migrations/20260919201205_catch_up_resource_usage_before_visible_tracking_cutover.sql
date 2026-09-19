-- Final catch-up of historical resource usage immediately before the
-- visible-resource tracker is deployed to Render.
--
-- This repeats the conservative repair model against the latest pre-cutover
-- session state, including sessions that opened after the first repair. It never
-- reduces recorded time and preserves all pre-cutover values in a private audit
-- table.

create table if not exists private.dp_resource_usage_repair_cutover_20260920 (
  session_id uuid primary key,
  user_id uuid not null,
  file_id text not null,
  started_at timestamptz not null,
  observed_end_at timestamptz not null,
  pre_cutover_active_seconds integer not null,
  repaired_active_seconds integer not null,
  heartbeat_count integer not null,
  foreground_cap_seconds bigint not null,
  next_platform_activity timestamptz,
  repaired_at timestamptz not null default now()
);

with base as (
  select
    s.id,
    s.user_id,
    s.file_id,
    s.started_at,
    coalesce(s.ended_at,s.last_heartbeat_at) as observed_end_at,
    s.active_seconds,
    s.heartbeat_count,
    (
      select min(l.created_at)
      from public.dp_resource_activity_logs l
      where l.user_id=s.user_id
        and l.created_at > s.started_at + interval '5 seconds'
        and (
          l.action in ('folder_opened','question_opened')
          or (l.action='file_opened' and l.file_id is distinct from s.file_id)
        )
    ) as next_platform_activity
  from public.dp_resource_usage_sessions s
),
calc as (
  select
    base.*,
    greatest(
      0,
      extract(epoch from (
        least(
          observed_end_at,
          coalesce(next_platform_activity,observed_end_at)
        ) - started_at
      ))
    )::bigint as foreground_cap_seconds
  from base
),
repair as (
  select
    calc.*,
    greatest(
      active_seconds::bigint,
      least(
        foreground_cap_seconds,
        heartbeat_count::bigint * 20,
        7200::bigint
      )
    )::integer as repaired_active_seconds
  from calc
)
insert into private.dp_resource_usage_repair_cutover_20260920 (
  session_id,
  user_id,
  file_id,
  started_at,
  observed_end_at,
  pre_cutover_active_seconds,
  repaired_active_seconds,
  heartbeat_count,
  foreground_cap_seconds,
  next_platform_activity
)
select
  id,
  user_id,
  file_id,
  started_at,
  observed_end_at,
  active_seconds,
  repaired_active_seconds,
  heartbeat_count,
  foreground_cap_seconds,
  next_platform_activity
from repair
on conflict (session_id) do nothing;

update public.dp_resource_usage_sessions s
set
  active_seconds=r.repaired_active_seconds,
  updated_at=now()
from private.dp_resource_usage_repair_cutover_20260920 r
where s.id=r.session_id
  and r.repaired_active_seconds>s.active_seconds;

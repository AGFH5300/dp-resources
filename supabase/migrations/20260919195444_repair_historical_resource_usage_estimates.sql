-- Historical resource-usage repair.
--
-- The old browser tracker stopped crediting time after two minutes without
-- pointer/keyboard/scroll activity, even while a student was still reading a
-- visible resource. It still emitted heartbeat requests, so old sessions retain
-- useful evidence even though active_seconds is too low.
--
-- Repair model:
--   1. Never reduce previously recorded active time.
--   2. Treat a later folder/question/different-file open as a foreground cap.
--   3. Convert heartbeat evidence at 20 seconds per heartbeat. This multiplier
--      was calibrated against short, high-confidence sessions where recorded
--      active time already covered at least 60% of wall time; it reconstructed
--      those sessions substantially better than the raw 10-second interval.
--   4. Cap any single reconstructed session at two hours.
--
-- A private snapshot preserves every original value before the update.

create table if not exists private.dp_resource_usage_repair_20260919 (
  session_id uuid primary key,
  user_id uuid not null,
  file_id text not null,
  started_at timestamptz not null,
  observed_end_at timestamptz not null,
  original_active_seconds integer not null,
  repaired_active_seconds integer not null,
  heartbeat_count integer not null,
  wall_seconds bigint not null,
  foreground_cap_seconds bigint not null,
  next_platform_activity timestamptz,
  repair_method text not null,
  repaired_at timestamptz not null default now()
);

with base as (
  select
    s.id,
    s.user_id,
    s.file_id,
    s.started_at,
    coalesce(s.ended_at, s.last_heartbeat_at) as observed_end_at,
    s.active_seconds,
    s.heartbeat_count,
    greatest(
      0,
      extract(epoch from (coalesce(s.ended_at, s.last_heartbeat_at) - s.started_at))
    )::bigint as wall_seconds,
    (
      select min(l.created_at)
      from public.dp_resource_activity_logs l
      where l.user_id = s.user_id
        and l.created_at > s.started_at + interval '5 seconds'
        and (
          l.action in ('folder_opened', 'question_opened')
          or (
            l.action = 'file_opened'
            and l.file_id is distinct from s.file_id
          )
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
          coalesce(next_platform_activity, observed_end_at)
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
insert into private.dp_resource_usage_repair_20260919 (
  session_id,
  user_id,
  file_id,
  started_at,
  observed_end_at,
  original_active_seconds,
  repaired_active_seconds,
  heartbeat_count,
  wall_seconds,
  foreground_cap_seconds,
  next_platform_activity,
  repair_method
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
  wall_seconds,
  foreground_cap_seconds,
  next_platform_activity,
  'max(original, min(foreground_cap, heartbeat_count*20s, 2h)); calibrated from short high-confidence sessions'
from repair
on conflict (session_id) do nothing;

update public.dp_resource_usage_sessions s
set
  active_seconds = r.repaired_active_seconds,
  updated_at = now()
from private.dp_resource_usage_repair_20260919 r
where s.id = r.session_id
  and r.repaired_active_seconds > s.active_seconds;

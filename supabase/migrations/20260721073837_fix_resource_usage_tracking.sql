-- Atomically records resource-viewing heartbeats from the authenticated API.
--
-- The browser supplies the active interval it observed, while the database
-- independently bounds that interval by wall-clock time. Row locking prevents
-- overlapping heartbeat/final requests from overwriting each other's totals.

create or replace function public.dp_resource_usage_heartbeat_admin_safe(
  p_session_id uuid,
  p_user_id uuid,
  p_page_visible boolean,
  p_was_active boolean,
  p_delta_seconds integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_last_heartbeat_at timestamptz;
  v_elapsed_seconds integer := 0;
  v_requested_seconds integer := 0;
  v_applied_seconds integer := 0;
begin
  if p_session_id is null or p_user_id is null then
    return 0;
  end if;

  select last_heartbeat_at
    into v_last_heartbeat_at
    from public.dp_resource_usage_sessions
   where id = p_session_id
     and user_id = p_user_id
     and ended_at is null
   for update;

  if not found then
    return 0;
  end if;

  v_elapsed_seconds := greatest(
    0,
    floor(extract(epoch from (clock_timestamp() - v_last_heartbeat_at)))::integer
  );
  v_requested_seconds := greatest(
    0,
    least(coalesce(p_delta_seconds, 0), 60)
  );

  -- Do not credit abandoned sessions. Short legitimate views are still
  -- counted because there is intentionally no minimum heartbeat duration.
  if coalesce(p_was_active, false) and v_elapsed_seconds <= 300 then
    v_applied_seconds := least(
      v_requested_seconds,
      v_elapsed_seconds,
      60
    );
  end if;

  update public.dp_resource_usage_sessions
     set active_seconds = active_seconds + v_applied_seconds,
         heartbeat_count = heartbeat_count + 1,
         last_heartbeat_at = clock_timestamp(),
         page_visible = coalesce(p_page_visible, false),
         updated_at = clock_timestamp()
   where id = p_session_id
     and user_id = p_user_id
     and ended_at is null;

  return v_applied_seconds;
end;
$$;

revoke execute on function public.dp_resource_usage_heartbeat_admin_safe(
  uuid,
  uuid,
  boolean,
  boolean,
  integer
) from public, anon, authenticated;

grant execute on function public.dp_resource_usage_heartbeat_admin_safe(
  uuid,
  uuid,
  boolean,
  boolean,
  integer
) to service_role;

comment on function public.dp_resource_usage_heartbeat_admin_safe(
  uuid,
  uuid,
  boolean,
  boolean,
  integer
) is
  'Atomically records a bounded resource-usage interval. Callable only by the service-role API.';

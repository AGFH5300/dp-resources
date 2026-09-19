-- Count the full interval while a Library resource remains visibly open.
-- The browser stops heartbeats when the resource tab is hidden, so a visible
-- reading interval may safely recover up to five minutes after a delayed request.

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
    least(coalesce(p_delta_seconds, 0), 300)
  );

  if coalesce(p_was_active, false) and v_elapsed_seconds <= 300 then
    v_applied_seconds := least(
      v_requested_seconds,
      v_elapsed_seconds,
      300
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

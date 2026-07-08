-- Corrective migration for resource usage analytics production hardening.
-- Apply after 20260708091000_resource_usage_analytics.sql.

create unique index if not exists dp_usage_sessions_one_active_user_file_idx
  on public.dp_resource_usage_sessions(user_id, file_id)
  where ended_at is null;

create index if not exists dp_usage_sessions_active_user_heartbeat_idx
  on public.dp_resource_usage_sessions(user_id, last_heartbeat_at)
  where ended_at is null;

create or replace function public.dp_resource_usage_cleanup_stale(p_stale_after interval default interval '10 minutes')
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer := 0;
begin
  update public.dp_resource_usage_sessions
     set ended_at = coalesce(ended_at, last_heartbeat_at),
         page_visible = false,
         updated_at = now()
   where ended_at is null
     and last_heartbeat_at < now() - p_stale_after;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.dp_resource_usage_start(p_file_id text) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_active_count integer;
  v_to_close uuid;
begin
  if v_user is null or not public.dp_is_approved_member(v_user) then
    raise exception using errcode = '42501', message = 'not authorized';
  end if;

  if not exists(select 1 from public.dp_resource_index where drive_file_id = p_file_id and is_folder = false) then
    raise exception using errcode = '02000', message = 'resource unavailable';
  end if;

  perform public.dp_resource_usage_cleanup_stale(interval '10 minutes');

  select id into v_id
    from public.dp_resource_usage_sessions
   where user_id = v_user and file_id = p_file_id and ended_at is null
   order by started_at desc
   limit 1
   for update;
  if found then
    return v_id;
  end if;

  update public.dp_resource_usage_sessions
     set ended_at = last_heartbeat_at,
         page_visible = false,
         updated_at = now()
   where user_id = v_user
     and ended_at is null
     and last_heartbeat_at < now() - interval '5 minutes';

  select count(*) into v_active_count
    from public.dp_resource_usage_sessions
   where user_id = v_user and ended_at is null;

  if v_active_count >= 2 then
    select id into v_to_close
      from public.dp_resource_usage_sessions
     where user_id = v_user and ended_at is null
     order by last_heartbeat_at asc, started_at asc
     limit 1
     for update;

    update public.dp_resource_usage_sessions
       set ended_at = last_heartbeat_at,
           page_visible = false,
           updated_at = now()
     where id = v_to_close;
  end if;

  insert into public.dp_resource_usage_sessions(user_id, file_id)
  values(v_user, p_file_id)
  on conflict (user_id, file_id) where ended_at is null do update
    set updated_at = public.dp_resource_usage_sessions.updated_at
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.dp_resource_usage_heartbeat(p_session_id uuid, p_page_visible boolean) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_ended timestamptz;
  v_delta integer := 0;
  v_elapsed integer := 0;
begin
  if v_user is null or not public.dp_is_approved_member(v_user) then
    raise exception using errcode = '42501', message = 'not authorized';
  end if;

  select last_heartbeat_at, ended_at into v_last, v_ended
    from public.dp_resource_usage_sessions
   where id = p_session_id and user_id = v_user
   for update;

  if not found then
    raise exception using errcode = '02000', message = 'resource unavailable';
  end if;
  if v_ended is not null then
    return 0;
  end if;

  v_elapsed := greatest(0, floor(extract(epoch from now() - v_last))::integer);
  if p_page_visible and v_elapsed >= 10 and v_last > now() - interval '5 minutes' then
    v_delta := least(60, v_elapsed);
  end if;

  update public.dp_resource_usage_sessions
     set active_seconds = active_seconds + v_delta,
         heartbeat_count = heartbeat_count + case when v_elapsed >= 10 then 1 else 0 end,
         last_heartbeat_at = case when v_elapsed >= 10 then now() else last_heartbeat_at end,
         page_visible = p_page_visible,
         updated_at = now()
   where id = p_session_id;

  return v_delta;
end;
$$;

create or replace function public.dp_admin_assert_resource_usage_admin() returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not public.dp_is_admin_member(auth.uid()) then
    raise exception using errcode = '42501', message = 'not authorized';
  end if;
end;
$$;

create or replace function public.dp_admin_resource_usage_leaderboard(p_range text default '30d', p_limit integer default 50)
returns table(rank bigint,file_id text,resource_name text,resource_path text,mime_type text,total_active_seconds bigint,unique_users bigint,session_count bigint,average_seconds_per_session numeric,last_used_at timestamptz)
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.dp_admin_assert_resource_usage_admin();
  perform public.dp_resource_usage_cleanup_stale(interval '10 minutes');
  return query
  with agg as (
    select s.file_id, sum(s.active_seconds)::bigint total, count(distinct s.user_id)::bigint users, count(*)::bigint sessions, max(coalesce(s.ended_at,s.last_heartbeat_at)) last_used
      from public.dp_resource_usage_sessions s
     where s.started_at >= public.dp_range_start(p_range)
     group by s.file_id
  )
  select dense_rank() over(order by agg.total desc), agg.file_id, i.name, i.path, i.mime_type, agg.total, agg.users, agg.sessions, round(agg.total::numeric/greatest(agg.sessions,1),1), agg.last_used
    from agg join public.dp_resource_index i on i.drive_file_id=agg.file_id
   order by agg.total desc
   limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

create or replace function public.dp_admin_resource_usage_for_resource(p_file_id text, p_range text default '30d')
returns table(user_id uuid,user_email text,total_active_seconds bigint,session_count bigint,last_used_at timestamptz)
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.dp_admin_assert_resource_usage_admin();
  perform public.dp_resource_usage_cleanup_stale(interval '10 minutes');
  return query
  select s.user_id,m.email,sum(s.active_seconds)::bigint,count(*)::bigint,max(coalesce(s.ended_at,s.last_heartbeat_at))
    from public.dp_resource_usage_sessions s
    join public.dp_resource_memberships m on m.id=s.user_id
   where s.file_id=p_file_id and s.started_at>=public.dp_range_start(p_range)
   group by s.user_id,m.email
   order by sum(s.active_seconds) desc;
end;
$$;

create or replace function public.dp_admin_resource_usage_for_user(p_user_id uuid, p_range text default '30d')
returns table(file_id text,resource_name text,resource_path text,total_active_seconds bigint,session_count bigint,last_used_at timestamptz)
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.dp_admin_assert_resource_usage_admin();
  perform public.dp_resource_usage_cleanup_stale(interval '10 minutes');
  return query
  select s.file_id,i.name,i.path,sum(s.active_seconds)::bigint,count(*)::bigint,max(coalesce(s.ended_at,s.last_heartbeat_at))
    from public.dp_resource_usage_sessions s
    join public.dp_resource_index i on i.drive_file_id=s.file_id
   where s.user_id=p_user_id and s.started_at>=public.dp_range_start(p_range)
   group by s.file_id,i.name,i.path
   order by sum(s.active_seconds) desc;
end;
$$;

revoke execute on function public.dp_admin_assert_resource_usage_admin() from public, anon, authenticated;
revoke execute on function public.dp_resource_usage_cleanup_stale(interval) from public, anon, authenticated;

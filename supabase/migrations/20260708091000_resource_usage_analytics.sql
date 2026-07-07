create extension if not exists pgcrypto;

create table if not exists public.dp_resource_usage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id text not null,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz null,
  active_seconds integer not null default 0,
  heartbeat_count integer not null default 0,
  page_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dp_usage_sessions_user_id_idx on public.dp_resource_usage_sessions(user_id);
create index if not exists dp_usage_sessions_file_id_idx on public.dp_resource_usage_sessions(file_id);
create index if not exists dp_usage_sessions_started_at_idx on public.dp_resource_usage_sessions(started_at);
create index if not exists dp_usage_sessions_active_seconds_idx on public.dp_resource_usage_sessions(active_seconds);
create index if not exists dp_usage_sessions_file_started_idx on public.dp_resource_usage_sessions(file_id, started_at);
create index if not exists dp_usage_sessions_user_started_idx on public.dp_resource_usage_sessions(user_id, started_at);
alter table public.dp_resource_usage_sessions enable row level security;
revoke all on public.dp_resource_usage_sessions from anon, authenticated;

create or replace view public.dp_resource_usage_daily as
select date_trunc('day', started_at)::date usage_date, file_id, user_id, sum(active_seconds)::integer active_seconds, count(*)::integer session_count, max(coalesce(ended_at,last_heartbeat_at)) last_used_at
from public.dp_resource_usage_sessions group by 1,2,3;
revoke all on public.dp_resource_usage_daily from anon, authenticated;

create or replace function public.dp_is_approved_member(p_user_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.dp_resource_memberships where id=p_user_id and is_approved=true);
$$;

create or replace function public.dp_is_admin_member(p_user_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.dp_resource_memberships where id=p_user_id and is_approved=true and role='admin');
$$;

create or replace function public.dp_resource_usage_start(p_file_id text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null or not public.dp_is_approved_member(v_user) then raise exception 'not allowed'; end if;
  if not exists(select 1 from public.dp_resource_index where drive_file_id=p_file_id and is_folder=false) then raise exception 'not found'; end if;
  insert into public.dp_resource_usage_sessions(user_id,file_id) values(v_user,p_file_id) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.dp_resource_usage_heartbeat(p_session_id uuid, p_page_visible boolean) returns integer language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_last timestamptz; v_ended timestamptz; v_delta integer:=0;
begin
  if v_user is null or not public.dp_is_approved_member(v_user) then raise exception 'not allowed'; end if;
  select last_heartbeat_at, ended_at into v_last, v_ended from public.dp_resource_usage_sessions where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'not found'; end if;
  if v_ended is not null then return 0; end if;
  if p_page_visible and v_last > now() - interval '5 minutes' then v_delta := least(60, greatest(0, floor(extract(epoch from now()-v_last))::integer)); end if;
  update public.dp_resource_usage_sessions set active_seconds=active_seconds+v_delta, heartbeat_count=heartbeat_count+1, last_heartbeat_at=now(), page_visible=p_page_visible, updated_at=now() where id=p_session_id;
  return v_delta;
end; $$;

create or replace function public.dp_resource_usage_end(p_session_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null or not public.dp_is_approved_member(v_user) then raise exception 'not allowed'; end if;
  update public.dp_resource_usage_sessions set ended_at=coalesce(ended_at,now()), page_visible=false, updated_at=now() where id=p_session_id and user_id=v_user;
  return found;
end; $$;

create or replace function public.dp_range_start(p_range text) returns timestamptz language sql stable as $$
select case lower(coalesce(p_range,'30d')) when 'today' then date_trunc('day', now()) when '7d' then now()-interval '7 days' when '7 days' then now()-interval '7 days' when '30d' then now()-interval '30 days' when '30 days' then now()-interval '30 days' when 'all' then 'epoch'::timestamptz when 'all time' then 'epoch'::timestamptz else now()-interval '30 days' end;
$$;

create or replace function public.dp_admin_resource_usage_leaderboard(p_range text default '30d', p_limit integer default 50)
returns table(rank bigint,file_id text,resource_name text,resource_path text,mime_type text,total_active_seconds bigint,unique_users bigint,session_count bigint,average_seconds_per_session numeric,last_used_at timestamptz)
language sql stable security definer set search_path=public as $$
with agg as (select s.file_id, sum(s.active_seconds) total, count(distinct s.user_id) users, count(*) sessions, max(coalesce(s.ended_at,s.last_heartbeat_at)) last_used from public.dp_resource_usage_sessions s where s.started_at >= public.dp_range_start(p_range) group by s.file_id)
select dense_rank() over(order by agg.total desc), agg.file_id, i.name, i.path, i.mime_type, agg.total, agg.users, agg.sessions, round(agg.total::numeric/greatest(agg.sessions,1),1), agg.last_used
from agg join public.dp_resource_index i on i.drive_file_id=agg.file_id
where public.dp_is_admin_member(auth.uid()) order by agg.total desc limit greatest(1,least(coalesce(p_limit,50),200));
$$;

create or replace function public.dp_admin_resource_usage_for_resource(p_file_id text, p_range text default '30d')
returns table(user_id uuid,user_email text,total_active_seconds bigint,session_count bigint,last_used_at timestamptz)
language sql stable security definer set search_path=public as $$
select s.user_id,m.email,sum(s.active_seconds),count(*),max(coalesce(s.ended_at,s.last_heartbeat_at)) from public.dp_resource_usage_sessions s join public.dp_resource_memberships m on m.id=s.user_id where public.dp_is_admin_member(auth.uid()) and s.file_id=p_file_id and s.started_at>=public.dp_range_start(p_range) group by s.user_id,m.email order by sum(s.active_seconds) desc;
$$;

create or replace function public.dp_admin_resource_usage_for_user(p_user_id uuid, p_range text default '30d')
returns table(file_id text,resource_name text,resource_path text,total_active_seconds bigint,session_count bigint,last_used_at timestamptz)
language sql stable security definer set search_path=public as $$
select s.file_id,i.name,i.path,sum(s.active_seconds),count(*),max(coalesce(s.ended_at,s.last_heartbeat_at)) from public.dp_resource_usage_sessions s join public.dp_resource_index i on i.drive_file_id=s.file_id where public.dp_is_admin_member(auth.uid()) and s.user_id=p_user_id and s.started_at>=public.dp_range_start(p_range) group by s.file_id,i.name,i.path order by sum(s.active_seconds) desc;
$$;

grant execute on function public.dp_resource_usage_start(text) to authenticated;
grant execute on function public.dp_resource_usage_heartbeat(uuid,boolean) to authenticated;
grant execute on function public.dp_resource_usage_end(uuid) to authenticated;
grant execute on function public.dp_admin_resource_usage_leaderboard(text,integer) to authenticated;
grant execute on function public.dp_admin_resource_usage_for_resource(text,text) to authenticated;
grant execute on function public.dp_admin_resource_usage_for_user(uuid,text) to authenticated;

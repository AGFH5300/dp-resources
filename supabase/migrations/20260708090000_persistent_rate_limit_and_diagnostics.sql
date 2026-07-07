create extension if not exists pgcrypto;

create table if not exists public.dp_rate_limit_buckets (
  scope text not null,
  request_key_hash text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, request_key_hash, window_start)
);
create index if not exists dp_rate_limit_buckets_updated_at_idx on public.dp_rate_limit_buckets(updated_at);
alter table public.dp_rate_limit_buckets enable row level security;
revoke all on public.dp_rate_limit_buckets from anon, authenticated;

create or replace function public.dp_check_rate_limit(p_scope text, p_request_key_hash text, p_limit integer, p_window_seconds integer)
returns table(ok boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count integer;
  v_retry integer;
begin
  if p_scope is null or p_request_key_hash is null or p_limit < 1 or p_window_seconds < 1 then
    return query select false, p_window_seconds;
    return;
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.dp_rate_limit_buckets(scope, request_key_hash, window_start, count)
  values (p_scope, p_request_key_hash, v_window, 1)
  on conflict (scope, request_key_hash, window_start)
  do update set count = public.dp_rate_limit_buckets.count + 1, updated_at = now()
  returning count into v_count;
  v_retry := greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer);
  return query select v_count <= p_limit, case when v_count <= p_limit then 0 else v_retry end;
end;
$$;
revoke all on function public.dp_check_rate_limit(text,text,integer,integer) from public;
grant execute on function public.dp_check_rate_limit(text,text,integer,integer) to service_role;

create table if not exists public.dp_server_error_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  level text not null default 'error',
  area text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb
);
create index if not exists dp_server_error_events_occurred_at_idx on public.dp_server_error_events(occurred_at desc);
alter table public.dp_server_error_events enable row level security;
revoke all on public.dp_server_error_events from anon, authenticated;

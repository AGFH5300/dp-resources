-- Disposable email blocking and application-level user suspension.

alter table public.dp_resource_memberships
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null,
  add column if not exists suspension_reason text;

update public.dp_resource_memberships
set is_approved = true,
    approved_at = coalesce(approved_at, now())
where is_approved is distinct from true;

create table if not exists public.dp_resource_email_domain_rules (
  domain text primary key,
  action text not null check (action in ('allow', 'block')),
  reason text,
  source text not null default 'admin',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dp_resource_email_domain_rules enable row level security;
revoke all on public.dp_resource_email_domain_rules from anon, authenticated;
revoke all on public.dp_resource_email_domain_rules from public;
grant select, insert, update on public.dp_resource_email_domain_rules to service_role;

create table if not exists public.dp_resource_moderation_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null check (action in ('suspend', 'unsuspend', 'block_domain')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.dp_resource_moderation_events enable row level security;
revoke all on public.dp_resource_moderation_events from anon, authenticated;
revoke all on public.dp_resource_moderation_events from public;
grant select, insert on public.dp_resource_moderation_events to service_role;

create or replace function public.dp_resource_email_domain_policy(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_domain text;
  v_rule public.dp_resource_email_domain_rules%rowtype;
begin
  v_domain := lower(split_part(coalesce(p_email, ''), '@', 2));
  if v_domain = '' or v_domain is null then
    return jsonb_build_object('allowed', false, 'domain', '', 'reason', 'invalid_email');
  end if;

  select * into v_rule
  from public.dp_resource_email_domain_rules
  where domain = v_domain
  limit 1;

  if found and v_rule.action = 'block' then
    return jsonb_build_object('allowed', false, 'domain', v_domain, 'reason', coalesce(v_rule.reason, 'blocked_domain'));
  end if;

  return jsonb_build_object('allowed', true, 'domain', v_domain, 'reason', null);
end;
$$;

revoke all on function public.dp_resource_email_domain_policy(text) from public;
grant execute on function public.dp_resource_email_domain_policy(text) to anon, authenticated, service_role;

create or replace function public.dp_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(coalesce(event #>> '{user,email}', event ->> 'email'));
  v_policy jsonb;
begin
  v_policy := public.dp_resource_email_domain_policy(v_email);
  if coalesce((v_policy ->> 'allowed')::boolean, false) is not true then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Temporary or disposable email addresses cannot be used. Please use a permanent email address.'));
  end if;
  return event;
end;
$$;

revoke all on function public.dp_before_user_created(jsonb) from public;
grant execute on function public.dp_before_user_created(jsonb) to supabase_auth_admin, service_role;

create or replace function public.dp_resource_create_membership_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.dp_resource_memberships (id, email, role, is_approved, approved_at)
  values (new.id, new.email, 'user', true, now())
  on conflict (id) do update set
    email = excluded.email,
    is_approved = true,
    approved_at = coalesce(public.dp_resource_memberships.approved_at, now());
  return new;
end;
$$;

revoke all on function public.dp_resource_create_membership_for_new_user() from public;

insert into public.dp_resource_email_domain_rules (domain, action, reason, source)
values ('epaynine.com', 'block', 'Disposable or abusive email domain', 'migration')
on conflict (domain) do update set action = excluded.action, reason = excluded.reason, source = excluded.source, updated_at = now();

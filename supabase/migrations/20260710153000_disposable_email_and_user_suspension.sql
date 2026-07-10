-- Disposable email blocking and application-level user suspension.

begin;

alter table public.dp_resource_memberships
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null,
  add column if not exists suspension_reason text;

alter table public.dp_resource_memberships
  alter column is_approved set default true;

alter table public.dp_resource_memberships
  alter column approved_at set default now();

update public.dp_resource_memberships
set
  is_approved = true,
  approved_at = coalesce(approved_at, created_at, now())
where is_approved is distinct from true
   or approved_at is null;

alter table public.dp_resource_memberships
  add constraint dp_resource_memberships_suspension_reason_length
    check (suspension_reason is null or char_length(btrim(suspension_reason)) between 3 and 500) not valid,
  add constraint dp_resource_memberships_suspended_metadata_required
    check (is_suspended = false or (suspended_at is not null and suspension_reason is not null)) not valid,
  add constraint dp_resource_memberships_unsuspended_metadata_cleared
    check (is_suspended = true or (suspended_at is null and suspended_by is null and suspension_reason is null)) not valid;

create table if not exists public.dp_resource_email_domain_rules (
  domain text primary key,
  action text not null,
  reason text,
  source text not null default 'admin',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dp_resource_email_domain_rules_domain_normalized check (domain = lower(btrim(domain)) and domain <> '' and domain !~ '@' and domain !~ '^\\.' and domain !~ '\\.$'),
  constraint dp_resource_email_domain_rules_action_valid check (action in ('allow', 'block'))
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
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint dp_resource_moderation_events_action_valid check (action in ('suspend', 'unsuspend', 'block_domain')),
  constraint dp_resource_moderation_events_reason_length check (reason is null or char_length(btrim(reason)) between 3 and 500)
);

alter table public.dp_resource_moderation_events enable row level security;
revoke all on public.dp_resource_moderation_events from anon, authenticated;
revoke all on public.dp_resource_moderation_events from public;
grant select, insert on public.dp_resource_moderation_events to service_role;

create or replace function public.dp_resource_email_domain_policy(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_rule public.dp_resource_email_domain_rules%rowtype;
begin
  v_domain := lower(btrim(split_part(coalesce(p_email, ''), '@', 2)));
  if v_domain = '' or v_domain is null then
    return jsonb_build_object('allowed', false, 'domain', '', 'reason', 'invalid_email');
  end if;

  select * into v_rule
  from public.dp_resource_email_domain_rules
  where v_domain = public.dp_resource_email_domain_rules.domain
     or v_domain like '%.' || public.dp_resource_email_domain_rules.domain
  order by char_length(public.dp_resource_email_domain_rules.domain) desc
  limit 1;

  if found and v_rule.action = 'block' then
    return jsonb_build_object('allowed', false, 'domain', v_domain, 'matched_domain', v_rule.domain, 'reason', coalesce(v_rule.reason, 'blocked_domain'));
  end if;

  return jsonb_build_object('allowed', true, 'domain', v_domain, 'matched_domain', case when found then v_rule.domain else null end, 'reason', null);
end;
$$;

revoke all on function public.dp_resource_email_domain_policy(text) from public;
grant execute on function public.dp_resource_email_domain_policy(text) to anon, authenticated, service_role, supabase_auth_admin;

create or replace function public.dp_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(event #>> '{user,email}', event ->> 'email')));
  v_policy jsonb;
begin
  v_policy := public.dp_resource_email_domain_policy(v_email);
  if coalesce((v_policy ->> 'allowed')::boolean, false) is not true then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Temporary or disposable email addresses cannot be used. Please use a permanent email address.'));
  end if;
  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.dp_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.dp_before_user_created(jsonb) from public, anon, authenticated;

create or replace function public.dp_resources_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.dp_resource_memberships (
    id,
    email,
    role,
    is_approved,
    approved_at
  )
  values (
    new.id,
    new.email,
    'user',
    true,
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    is_approved = true,
    approved_at = coalesce(
      public.dp_resource_memberships.approved_at,
      now()
    );

  return new;
end;
$function$;

insert into public.dp_resource_email_domain_rules (domain, action, reason, source)
values ('epaynine.com', 'block', 'Disposable or abusive email domain', 'migration')
on conflict (domain) do update set action = excluded.action, reason = excluded.reason, source = excluded.source, updated_at = now();

commit;

-- Compact the 75k disposable-email rule table without changing effective policy.
--
-- The 2026-08-16 production audit found 75,597 rows. 75,559 were imported
-- blocklist rows with repeated source/reason/timestamp metadata and no creator;
-- only 38 rows were protected/manual/migration exceptions worth retaining with
-- their full provenance. This migration partitions those rows, verifies the
-- partition exactly, replaces the policy function, then releases the old heap.
--
-- The application-facing table name dp_resource_email_domain_rules is retained,
-- so admin suspension/domain-block code does not need a deployment-order change.

set lock_timeout = '5s';
set statement_timeout = '180s';

create table if not exists public.dp_resource_disposable_email_domains (
  domain text primary key,
  constraint dp_resource_disposable_email_domains_normalized check (
    domain = lower(btrim(domain))
    and domain ~
      '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);

-- Temporary physical replacement for the large historical table. It has the
-- same writable columns so the final rename preserves the application contract.
create table if not exists public.dp_resource_email_domain_rules_compact (
  domain text primary key,
  action text not null,
  reason text,
  source text not null default 'admin',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dp_resource_email_domain_rules_compact_action_valid
    check (action in ('allow', 'block')),
  constraint dp_resource_email_domain_rules_compact_normalized check (
    domain = lower(btrim(domain))
    and domain ~
      '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);

-- These five sources are the bulk imported disposable-domain corpus observed in
-- production. Their source/reason strings are dataset metadata rather than
-- per-domain moderation history. Any unfamiliar/future source is conservatively
-- retained in the full-metadata compact rules table instead of being discarded.
insert into public.dp_resource_disposable_email_domains (domain)
select domain
from public.dp_resource_email_domain_rules
where action = 'block'
  and created_by is null
  and source in (
    'merged:disposable-aggregator',
    'disposable-email-domains',
    'merged:disposable-aggregator+fakefilter',
    'merged:wesbos-burner-email-providers',
    'merged:fakefilter'
  )
on conflict (domain) do nothing;

-- Preserve every non-bulk row exactly, including protected allow rules,
-- migration-specific blocks, future sources and admin-authored provenance.
insert into public.dp_resource_email_domain_rules_compact (
  domain,
  action,
  reason,
  source,
  created_by,
  created_at,
  updated_at
)
select
  old_rule.domain,
  old_rule.action,
  old_rule.reason,
  old_rule.source,
  old_rule.created_by,
  old_rule.created_at,
  old_rule.updated_at
from public.dp_resource_email_domain_rules old_rule
where not exists (
  select 1
  from public.dp_resource_disposable_email_domains bulk
  where bulk.domain = old_rule.domain
)
on conflict (domain) do update
set
  action = excluded.action,
  reason = excluded.reason,
  source = excluded.source,
  created_by = excluded.created_by,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

-- Refuse to release the legacy relation unless every old domain/action is
-- represented exactly once by the compact partition, in both directions.
do $$
declare
  old_count bigint;
  partition_count bigint;
begin
  select count(*) into old_count
  from public.dp_resource_email_domain_rules;

  select
    (select count(*) from public.dp_resource_disposable_email_domains)
    + (select count(*) from public.dp_resource_email_domain_rules_compact)
  into partition_count;

  if old_count <> partition_count then
    raise exception
      'Disposable-email compaction count mismatch: old %, compact %',
      old_count,
      partition_count;
  end if;

  if exists (
    select 1
    from public.dp_resource_disposable_email_domains bulk
    join public.dp_resource_email_domain_rules_compact compact_rule
      using (domain)
  ) then
    raise exception 'Disposable-email compact partitions overlap';
  end if;

  if exists (
    with compact as (
      select bulk.domain, 'block'::text as action
      from public.dp_resource_disposable_email_domains bulk
      union all
      select compact_rule.domain, compact_rule.action
      from public.dp_resource_email_domain_rules_compact compact_rule
    )
    select 1
    from public.dp_resource_email_domain_rules old_rule
    full outer join compact using (domain)
    where old_rule.domain is null
       or compact.domain is null
       or old_rule.action is distinct from compact.action
  ) then
    raise exception 'Disposable-email compact partition changed an effective rule';
  end if;
end;
$$;

alter table public.dp_resource_disposable_email_domains enable row level security;
alter table public.dp_resource_email_domain_rules_compact enable row level security;
revoke all on public.dp_resource_disposable_email_domains
  from public, anon, authenticated;
revoke all on public.dp_resource_email_domain_rules_compact
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.dp_resource_disposable_email_domains to service_role;
grant select, insert, update, delete
  on public.dp_resource_email_domain_rules_compact to service_role;

-- Replace the old %rowtype-based implementation before dropping its relation.
-- While the old table still exists this already preserves current semantics;
-- after the compact table is renamed to the same name it transparently probes
-- the small override table plus the bulk blocklist.
create or replace function public.dp_resource_email_domain_policy(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_match record;
begin
  v_domain := lower(btrim(split_part(coalesce(p_email, ''), '@', 2)));
  if v_domain = '' or v_domain is null then
    return jsonb_build_object(
      'allowed', false,
      'domain', '',
      'reason', 'invalid_email'
    );
  end if;

  with recursive candidates(domain, depth) as (
    select v_domain, 0
    union all
    select substring(candidate.domain from position('.' in candidate.domain) + 1),
           candidate.depth + 1
    from candidates candidate
    where position('.' in candidate.domain) > 0
  ), matched as (
    select
      candidate.domain as matched_domain,
      candidate.depth,
      rule.action,
      0 as source_priority
    from candidates candidate
    join public.dp_resource_email_domain_rules rule
      on rule.domain = candidate.domain

    union all

    select
      candidate.domain as matched_domain,
      candidate.depth,
      'block'::text as action,
      1 as source_priority
    from candidates candidate
    join public.dp_resource_disposable_email_domains bulk
      on bulk.domain = candidate.domain
  )
  select matched_domain, action
  into v_match
  from matched
  order by depth, source_priority
  limit 1;

  if found then
    return jsonb_build_object(
      'allowed', v_match.action <> 'block',
      'domain', v_domain,
      'matched_domain', v_match.matched_domain,
      'reason', case when v_match.action = 'block' then 'blocked_domain' else null end
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'domain', v_domain,
    'matched_domain', null,
    'reason', null
  );
end;
$$;

revoke all on function public.dp_resource_email_domain_policy(text) from public;
grant execute on function public.dp_resource_email_domain_policy(text)
  to anon, authenticated, service_role, supabase_auth_admin;

-- Release the 75k-row heap + historical primary-key relation and immediately
-- restore the exact table name with the compact exceptional rules.
drop table public.dp_resource_email_domain_rules;
alter table public.dp_resource_email_domain_rules_compact
  rename to dp_resource_email_domain_rules;

-- Re-apply grants using the final relation name.
revoke all on public.dp_resource_email_domain_rules
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.dp_resource_email_domain_rules to service_role;

-- Recompile the policy body after the relation swap so no cached plan can point
-- at the released legacy relation.
create or replace function public.dp_resource_email_domain_policy(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_match record;
begin
  v_domain := lower(btrim(split_part(coalesce(p_email, ''), '@', 2)));
  if v_domain = '' or v_domain is null then
    return jsonb_build_object(
      'allowed', false,
      'domain', '',
      'reason', 'invalid_email'
    );
  end if;

  with recursive candidates(domain, depth) as (
    select v_domain, 0
    union all
    select substring(candidate.domain from position('.' in candidate.domain) + 1),
           candidate.depth + 1
    from candidates candidate
    where position('.' in candidate.domain) > 0
  ), matched as (
    select
      candidate.domain as matched_domain,
      candidate.depth,
      rule.action,
      0 as source_priority
    from candidates candidate
    join public.dp_resource_email_domain_rules rule
      on rule.domain = candidate.domain

    union all

    select
      candidate.domain as matched_domain,
      candidate.depth,
      'block'::text as action,
      1 as source_priority
    from candidates candidate
    join public.dp_resource_disposable_email_domains bulk
      on bulk.domain = candidate.domain
  )
  select matched_domain, action
  into v_match
  from matched
  order by depth, source_priority
  limit 1;

  if found then
    return jsonb_build_object(
      'allowed', v_match.action <> 'block',
      'domain', v_domain,
      'matched_domain', v_match.matched_domain,
      'reason', case when v_match.action = 'block' then 'blocked_domain' else null end
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'domain', v_domain,
    'matched_domain', null,
    'reason', null
  );
end;
$$;

revoke all on function public.dp_resource_email_domain_policy(text) from public;
grant execute on function public.dp_resource_email_domain_policy(text)
  to anon, authenticated, service_role, supabase_auth_admin;

comment on table public.dp_resource_disposable_email_domains is
  'Compact imported disposable-email blocklist. Bulk per-domain source/reason/timestamps are normalized away.';
comment on table public.dp_resource_email_domain_rules is
  'Explicit protected/manual/admin email-domain policy rules with retained moderation provenance.';

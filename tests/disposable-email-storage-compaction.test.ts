import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260816143000_compact_disposable_email_domains.sql',
  'utf8',
);
const suspensionRoute = readFileSync(
  'app/api/admin/users/[id]/suspension/route.ts',
  'utf8',
);

describe('disposable-email storage compaction', () => {
  it('keeps the existing application-facing rule table and RPC names', () => {
    expect(migration).toContain(
      'rename to dp_resource_email_domain_rules;',
    );
    expect(migration).toContain(
      'create or replace function public.dp_resource_email_domain_policy(p_email text)',
    );
    expect(suspensionRoute).toContain(
      ".from('dp_resource_email_domain_rules')",
    );
  });

  it('moves only audited creatorless bulk-block sources into the compact corpus', () => {
    for (const source of [
      'merged:disposable-aggregator',
      'disposable-email-domains',
      'merged:disposable-aggregator+fakefilter',
      'merged:wesbos-burner-email-providers',
      'merged:fakefilter',
    ]) {
      expect(migration).toContain(`'${source}'`);
    }
    expect(migration).toContain("where action = 'block'");
    expect(migration).toContain('and created_by is null');
  });

  it('retains non-bulk rules with their complete moderation provenance', () => {
    for (const column of [
      'domain',
      'action',
      'reason',
      'source',
      'created_by',
      'created_at',
      'updated_at',
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain(
      'from public.dp_resource_email_domain_rules old_rule',
    );
    expect(migration).toContain(
      'from public.dp_resource_disposable_email_domains bulk',
    );
  });

  it('hard-fails on count, overlap or effective-policy mismatch before dropping the old relation', () => {
    const countGuard = migration.indexOf(
      'Disposable-email compaction count mismatch',
    );
    const overlapGuard = migration.indexOf(
      'Disposable-email compact partitions overlap',
    );
    const policyGuard = migration.indexOf(
      'Disposable-email compact partition changed an effective rule',
    );
    const dropOld = migration.indexOf(
      'drop table public.dp_resource_email_domain_rules;',
    );

    expect(countGuard).toBeGreaterThan(0);
    expect(overlapGuard).toBeGreaterThan(countGuard);
    expect(policyGuard).toBeGreaterThan(overlapGuard);
    expect(dropOld).toBeGreaterThan(policyGuard);
    expect(migration).toContain('full outer join compact using (domain)');
    expect(migration).toContain(
      'old_rule.action is distinct from compact.action',
    );
  });

  it('preserves most-specific parent-domain policy behavior with indexed equality candidates', () => {
    expect(migration).toContain('with recursive candidates(domain, depth)');
    expect(migration).toContain('on rule.domain = candidate.domain');
    expect(migration).toContain('on bulk.domain = candidate.domain');
    expect(migration).toContain('order by depth, source_priority');
    expect(migration).toContain("'matched_domain', v_match.matched_domain");
  });

  it('makes the copy/swap atomic and prevents concurrent source-table writes', () => {
    expect(migration).toContain('begin;');
    expect(migration).toContain("set local lock_timeout = '5s';");
    expect(migration).toContain("set local statement_timeout = '180s';");
    expect(migration).toContain(
      'lock table public.dp_resource_email_domain_rules in share mode;',
    );
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('preserves historical constraint names after replacing the physical table', () => {
    for (const constraint of [
      'dp_resource_email_domain_rules_pkey',
      'dp_resource_email_domain_rules_action_valid',
      'dp_resource_email_domain_rules_domain_normalized',
      'dp_resource_email_domain_rules_created_by_fkey',
    ]) {
      expect(migration).toContain(`to ${constraint};`);
    }
  });

  it('keeps direct table access server-only', () => {
    expect(migration).toContain(
      'revoke all on public.dp_resource_disposable_email_domains',
    );
    expect(migration).toContain(
      'revoke all on public.dp_resource_email_domain_rules',
    );
    expect(migration).toContain(
      'to anon, authenticated, service_role, supabase_auth_admin;',
    );
  });
});

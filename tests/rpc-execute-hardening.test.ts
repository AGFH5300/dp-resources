import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260814145411_revoke_unintended_anonymous_rpc_access.sql',
  'utf8',
);

describe('RPC execute privilege hardening', () => {
  it('keeps server-only rate limiting off anon and authenticated roles', () => {
    expect(migration).toContain(
      'revoke execute on function public.dp_check_rate_limit(text, text, integer, integer)',
    );
    expect(migration).toContain('from public, anon, authenticated;');
    expect(migration).toContain(
      'grant execute on function public.dp_check_rate_limit(text, text, integer, integer)',
    );
    expect(migration).toContain('to service_role;');
  });

  it('removes anonymous access to privileged and member-only usage RPCs', () => {
    expect(migration).toContain(
      'public.dp_admin_resource_usage_leaderboard(text, integer)',
    );
    expect(migration).toContain('public.dp_admin_resource_usage_for_user(uuid, text)');
    expect(migration).toContain(
      'public.dp_admin_resource_usage_for_resource(text, text)',
    );
    expect(migration).toContain('public.dp_resource_usage_start(text)');
    expect(migration).toContain(
      'public.dp_resource_usage_heartbeat(uuid, boolean)',
    );
    expect(migration).toContain('public.dp_resource_usage_end(uuid)');
    expect(migration).toContain('public.dp_resources_is_admin()');
  });

  it('does not expose trigger-only identity functions as API RPCs', () => {
    expect(migration).toContain('public.dp_identity_enforce_auth_user()');
    expect(migration).toContain('public.dp_identity_enforce_profile()');
    expect(migration).toContain('from public, anon, authenticated;');
  });
});

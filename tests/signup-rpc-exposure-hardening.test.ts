import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('signup availability RPC exposure', () => {
  it('runs production database availability checks with the server service-role client', () => {
    const availability = read('app/api/auth/availability/route.ts');
    const signup = read('app/api/auth/start-signup/route.ts');

    expect(availability).toContain(
      "import { createSupabaseAdminClient } from '@/lib/supabase-admin'",
    );
    expect(availability).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(availability).toContain('createSupabaseAdminClient()');
    expect(signup).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(signup).toContain('createSupabaseAdminClient()');
    expect(signup).toContain(
      "admin.rpc('dp_resource_username_availability_status'",
    );
    expect(signup).toContain("admin.rpc('dp_resource_is_email_available'");
    expect(signup).toContain('supabase.auth.signInWithOtp');
  });

  it('revokes direct anon/authenticated execution of signup SECURITY DEFINER RPCs', () => {
    const migration = read(
      'supabase/migrations/20260814154800_lock_signup_availability_rpcs.sql',
    );

    for (const rpc of [
      'dp_resource_email_domain_policy',
      'dp_resource_is_email_available',
      'dp_resource_is_username_available',
      'dp_resource_username_availability_status',
    ]) {
      expect(migration).toContain(`public.${rpc}(text)`);
    }
    expect(migration.match(/from public, anon, authenticated/g)?.length).toBe(4);
    expect(migration).toContain('to service_role, supabase_auth_admin');
  });
});

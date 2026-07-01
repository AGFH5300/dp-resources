import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const schema = readFileSync('supabase/schema.sql', 'utf8');

describe('DP Resources shared-auth schema isolation', () => {
  it('uses DP Resources-owned tables and auth trigger names', () => {
    expect(schema).toContain('public.dp_resource_memberships');
    expect(schema).toContain('public.dp_resource_activity_logs');
    expect(schema).toContain('public.dp_resources_is_admin()');
    expect(schema).toContain('public.dp_resources_handle_new_user()');
    expect(schema).toContain('dp_resources_on_auth_user_created');
  });

  it('does not manage MYP Atlas profiles, functions, or auth trigger', () => {
    expect(schema).not.toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.profiles/i);
    expect(schema).not.toMatch(/alter\s+table\s+public\.profiles/i);
    expect(schema).not.toMatch(/create\s+or\s+replace\s+function\s+public\.handle_new_user/i);
    expect(schema).not.toMatch(/drop\s+trigger/i);
    expect(schema).not.toMatch(/create\s+trigger\s+on_auth_user_created/i);
  });

  it('revokes direct RPC execution from DP Resources helper functions without touching service_role', () => {
    expect(schema).toContain('revoke execute on function public.dp_resources_is_admin() from public, anon, authenticated;');
    expect(schema).toContain('revoke execute on function public.dp_resources_handle_new_user() from public, anon, authenticated;');
    expect(schema).not.toMatch(/revoke\s+execute\s+on\s+function\s+public\.dp_resources_(?:is_admin|handle_new_user)\(\)\s+from\s+service_role/i);
  });

  it('backfills existing auth users as pending DP Resources members', () => {
    expect(schema).toContain("insert into public.dp_resource_memberships (id, email, role, is_approved)");
    expect(schema).toContain("select id, email, 'user', false");
    expect(schema).toContain('from auth.users');
    expect(schema).toContain('on conflict (id) do nothing');
  });
});

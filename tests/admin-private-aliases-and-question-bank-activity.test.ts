import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const migration = read(
  'supabase/migrations/20260912195000_admin_aliases_and_question_bank_activity.sql',
);
const denyMigration = read(
  'supabase/migrations/20260912201000_admin_aliases_explicit_member_deny.sql',
);
const aliasRoute = read('app/api/admin/users/aliases/route.ts');
const aliasBridge = read('components/admin/user-aliases.tsx');
const layout = read('app/admin/layout.tsx');
const questionRoute = read('app/api/question-bank/questions/[variantId]/route.ts');
const activity = read('lib/activity.ts');
const filters = read('lib/admin-filters.ts');
const whatsNew = read('lib/whats-new.ts');
const changelog = read('lib/changelog.ts');

describe('admin-private aliases and complete Activity tracking', () => {
  it('stores aliases outside member profiles and denies member access at grants and RLS', () => {
    expect(migration).toContain('create table if not exists public.dp_admin_user_aliases');
    expect(migration).toContain('alter table public.dp_admin_user_aliases enable row level security');
    expect(migration).toContain(
      'revoke all on table public.dp_admin_user_aliases from public, anon, authenticated',
    );
    expect(migration).toContain(
      'grant select, insert, update, delete on table public.dp_admin_user_aliases to service_role',
    );
    expect(denyMigration).toContain('admin aliases are never member visible');
    expect(denyMigration).toContain('to anon, authenticated');
    expect(denyMigration).toContain('using (false)');
    expect(denyMigration).toContain('with check (false)');
    expect(migration).not.toContain('dp_resource_profiles (');
  });

  it('serves and changes aliases only through an admin-protected API', () => {
    expect(aliasRoute.match(/await requireAdmin\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(aliasRoute).toContain(".from('dp_admin_user_aliases')");
    expect(aliasRoute).toContain("Cache-Control', 'private, no-store, max-age=0'");
    expect(aliasRoute).toContain('sameOriginOrForbidden(req)');
    expect(aliasRoute).not.toContain('requireMember');
  });

  it('provides a per-user alias manager only inside the Admin layout', () => {
    expect(layout).toContain('AdminUserAliasesBridge');
    expect(aliasBridge).toContain('Manage private aliases');
    expect(aliasBridge).toContain('Private user aliases');
    expect(aliasBridge).toContain('/api/admin/users/aliases');
    expect(aliasBridge).toContain('AliasEditor');
    expect(aliasBridge).toContain("section === 'users'");
    expect(aliasBridge).toContain('[data-dp-admin-alias]::before');
  });

  it('records Question Bank opens in the existing admin Activity stream', () => {
    expect(migration).toContain("'question_opened'");
    expect(migration).toContain('from public.dp_qb_user_progress progress');
    expect(activity).toContain('recordQuestionOpenedOnce');
    expect(questionRoute).toContain('recordQuestionOpenedOnce(request');
    expect(questionRoute).toContain('variant.course?.name');
    expect(filters).toContain("'question_opened'");
  });

  it('keeps the public release surfaces free of the private alias feature', () => {
    expect(whatsNew).not.toMatch(/private user alias|admin alias|dp_admin_user_aliases/i);
    const currentPublicHistory = changelog.slice(
      changelog.indexOf("'2026-09-12'"),
      changelog.indexOf("'2026-09-10'"),
    );
    expect(currentPublicHistory).not.toMatch(/alias|administrator|admin-only/i);
  });

  it('curates both 11 and 12 September in the public changelog and refreshes What’s New', () => {
    expect(changelog).toContain("'2026-09-12': [");
    expect(changelog).toContain("'2026-09-11': [");
    expect(changelog).toContain('Added one-click Question Bank filters');
    expect(changelog).toContain('Added DP Resources social sign-in and Connected Accounts support');
    expect(changelog).toContain('Added fullscreen support to the standard browser PDF fallback');
    expect(whatsNew).toContain("id: '2026-09-12-paper-filters-social-signin'");
    expect(whatsNew).toContain("dateLabel: '12 September 2026'");
  });
});

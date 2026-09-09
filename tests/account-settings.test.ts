import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const migration = read(
  'supabase/migrations/20260909123000_settings_account_centre.sql',
);
const schema = read('supabase/schema.sql');
const settingsRoute = read('app/api/account/settings/route.ts');
const securityRoute = read('app/api/account/security/route.ts');
const avatarRoute = read('app/api/account/avatar/route.ts');
const settingsPage = read('app/settings/settings-centre.tsx');
const accountMenu = read('components/account-menu.tsx');
const appHeader = read('components/app-header.tsx');
const attribution = read('components/content-source-badge.tsx');
const notifications = read('app/api/notifications/route.ts');

describe('Settings & Account Centre', () => {
  it('keeps account settings additive, private and represented in the canonical schema', () => {
    for (const source of [migration, schema]) {
      expect(source).toContain('public.dp_resource_user_settings');
      expect(source).toContain('show_library_source_tags');
      expect(source).toContain('show_library_resource_type_labels');
      expect(source).toContain('show_question_bank_source_tags');
      expect(source).toContain('show_expanded_source_attribution');
      expect(source).toContain('support_notifications');
      expect(source).toContain('show_whats_new');
      expect(source).toContain('academic_subjects');
      expect(source).toContain('exam_year');
      expect(source).toContain('exam_session');
      expect(source).toContain('dp-resource-avatars');
      expect(source).toContain('enable row level security');
    }
    expect(migration).toContain('auth.uid() = id');
    expect(migration).toContain('dp_resources_sync_auth_email');
  });

  it('protects settings, security and avatar mutations on the server', () => {
    for (const route of [settingsRoute, securityRoute, avatarRoute]) {
      expect(route).toContain('requireApiMember');
      expect(route).toContain('sameOriginOrForbidden');
    }
    expect(securityRoute).toContain('currentPassword');
    expect(securityRoute).toContain('signInWithPassword');
    expect(securityRoute).toContain('rateLimit');
    expect(avatarRoute).toContain('ACCOUNT_AVATAR_MAX_BYTES');
    expect(avatarRoute).toContain('hasExpectedMagicBytes');
  });

  it('provides profile, academic, preference and security UI with app-native selects', () => {
    expect(settingsPage).toContain("type TabId = 'profile' | 'academic' | 'preferences' | 'security'");
    expect(settingsPage).toContain('<AppSelect');
    expect(settingsPage).toContain("fetch('/api/account/settings'");
    expect(settingsPage).toContain("fetch('/api/account/security'");
    expect(settingsPage).toContain("fetch('/api/account/avatar'");
    expect(settingsPage).toContain('Library source tags');
    expect(settingsPage).toContain('Question Bank source tags');
    expect(settingsPage).toContain('Expanded source attribution');
  });

  it('adds the account centre and avatar to the existing account menu', () => {
    expect(accountMenu).toContain('href="/settings"');
    expect(accountMenu).toContain('avatarUrl');
    expect(appHeader).toContain('dp:profile-changed');
    expect(appHeader).toContain('useAccountPreferenceState');
    expect(appHeader).toContain('preferencesReady');
  });

  it('applies source-label preferences at the shared attribution layer', () => {
    expect(attribution).toContain('useAccountPreferences');
    expect(attribution).toContain('showLibrarySourceTags');
    expect(attribution).toContain('showLibraryResourceTypeLabels');
    expect(attribution).toContain('showQuestionBankSourceTags');
    expect(attribution).toContain('showExpandedSourceAttribution');
  });

  it('removes disabled support notifications from both feed and unread counts', () => {
    expect(notifications).toContain('support_notifications');
    expect(notifications).toContain('userTicketKinds');
    expect(notifications).toContain('hiddenUnread');
    expect(notifications).toContain('Math.max(0, (unread.count || 0) - hiddenUnread)');
  });
});

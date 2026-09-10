import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const migrationPath =
  'supabase/migrations/20260909111409_settings_account_centre.sql';
const migration = read(migrationPath);
const schema = read('supabase/schema.sql');
const settingsRoute = read('app/api/account/settings/route.ts');
const securityRoute = read('app/api/account/security/route.ts');
const avatarRoute = read('pages/api/account/avatar.ts');
const settingsPage = read('app/settings/settings-centre.tsx');
const accountMenu = read('components/account-menu.tsx');
const appHeader = read('components/app-header.tsx');
const attribution = read('components/content-source-badge.tsx');
const notifications = read('app/api/notifications/route.ts');
const whatsNew = read('lib/whats-new.ts');
const packageJson = read('package.json');

describe('Settings & Account Centre', () => {
  it('tracks the exact migration version applied to production', () => {
    expect(migrationPath).toContain('20260909111409_settings_account_centre.sql');
  });

  it('keeps account settings private and represented in the canonical schema', () => {
    for (const source of [migration, schema]) {
      expect(source).toContain('public.dp_resource_user_settings');
      expect(source).toContain('show_library_source_tags');
      expect(source).toContain('show_library_resource_type_labels');
      expect(source).toContain('show_question_bank_source_tags');
      expect(source).toContain('show_expanded_source_attribution');
      expect(source).toContain('support_notifications');
      expect(source).toContain('show_whats_new');
      expect(source).toContain('dp-resource-avatars');
      expect(source).toContain('enable row level security');
      expect(source).toContain('dp_resource_user_settings_set_updated_at');
      expect(source).toContain('set search_path = public');
    }
    expect(migration).toContain('auth.uid() = id');
    expect(migration).toContain('dp_resources_sync_auth_email');
  });

  it('removes the academic profile from the account-centre UI and API', () => {
    expect(settingsPage).toContain("type TabId = 'profile' | 'preferences' | 'security'");
    expect(settingsPage).not.toContain("id: 'academic'");
    expect(settingsPage).not.toContain('Academic profile');
    expect(settingsPage).not.toContain('<AppSelect');
    expect(settingsRoute).not.toContain('availableSubjects');
    expect(settingsRoute).not.toContain('body.academic');
    expect(settingsRoute).not.toContain('dp_qb_subjects');
  });

  it('protects settings, security and avatar mutations on the server', () => {
    for (const route of [settingsRoute, securityRoute]) {
      expect(route).toContain('requireApiMember');
      expect(route).toContain('sameOriginOrForbidden');
    }
    expect(avatarRoute).toContain('sameOrigin(req)');
    expect(avatarRoute).toContain('authenticatedUser(req, res)');
    expect(securityRoute).toContain('currentPassword');
    expect(securityRoute).toContain('signInWithPassword');
    expect(securityRoute).toContain('rateLimit');
    expect(avatarRoute).toContain('ACCOUNT_AVATAR_MAX_BYTES');
    expect(avatarRoute).toContain('hasExpectedMagicBytes');
  });

  it('handles avatar bytes through a raw Node API stream instead of the App Router request adapter', () => {
    expect(settingsPage).toContain("headers: { 'Content-Type': file.type }");
    expect(settingsPage).toContain('body: file');
    expect(avatarRoute).toContain('bodyParser: false');
    expect(avatarRoute).toContain('for await (const chunk of req)');
    expect(avatarRoute).toContain(".upload(path, bytes");
    expect(avatarRoute).not.toContain('request.arrayBuffer()');
    expect(avatarRoute).not.toContain('request.formData()');
  });

  it('uses the signup username availability endpoint with live debounce feedback', () => {
    expect(settingsPage).toContain('USERNAME_DEBOUNCE_MS = 600');
    expect(settingsPage).toContain('/api/auth/availability?type=username&value=');
    expect(settingsPage).toContain('Username is available.');
    expect(settingsPage).toContain('<CheckCircle2');
    expect(settingsPage).toContain('<AlertCircle');
    expect(settingsPage).toContain('<Spinner');
  });

  it('keeps preference switch thumbs inside their tracks', () => {
    expect(settingsPage).toContain('absolute left-0.5 top-0.5');
    expect(settingsPage).toContain("checked ? 'translate-x-5' : 'translate-x-0'");
  });

  it('provides profile, preference and security UI', () => {
    expect(settingsPage).toContain("fetch('/api/account/settings'");
    expect(settingsPage).toContain("fetch('/api/account/security'");
    expect(settingsPage).toContain("fetch('/api/account/avatar'");
    expect(settingsPage).toContain('Library source tags');
    expect(settingsPage).toContain('Question Bank source tags');
    expect(settingsPage).toContain('Expanded source attribution');
  });

  it('adds username fields to password forms for password-manager accessibility', () => {
    expect(settingsPage.match(/name="username"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(settingsPage).toContain('autoComplete="username"');
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
    expect(notifications).toContain(
      'Math.max(0, (unread.count || 0) - hiddenUnread)',
    );
  });

  it('updates the unreleased What’s New entry to the final Settings scope', () => {
    expect(whatsNew).toContain("id: '2026-09-10-settings-account-centre'");
    expect(whatsNew).toContain('Username availability is checked automatically');
    expect(whatsNew).not.toContain('Save your IB academic profile');
  });

  it('pins production dependencies above the resolved high and critical advisory ranges', () => {
    expect(packageJson).toContain('"next": "^15.5.24"');
    expect(packageJson).toContain('"sharp": "0.35.4"');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('modern social authentication', () => {
  it('keeps the requested providers while the zero-cost direct engine launches with Google, Microsoft and GitHub', () => {
    const providers = read('lib/social-auth.ts');
    const direct = read('lib/direct-social-auth.ts');
    expect(providers).toContain("'google'");
    expect(providers).toContain("'microsoft'");
    expect(providers).toContain("'apple'");
    expect(providers).toContain("'github'");
    expect(direct).toContain("['google', 'microsoft', 'github']");
    expect(direct).toContain('GOOGLE_OAUTH_CLIENT_ID');
    expect(direct).toContain('MICROSOFT_OAUTH_CLIENT_ID');
    expect(direct).toContain('GITHUB_OAUTH_CLIENT_ID');
  });

  it('shows social options on both login and signup without replacing email/password', () => {
    const shell = read('components/auth-shell.tsx');
    const buttons = read('components/auth/social-auth-buttons.tsx');
    const login = read('app/auth/login/page.tsx');
    const signup = read('app/auth/sign-up/page.tsx');

    expect(shell).toContain("pathname === '/auth/sign-up'");
    expect(shell).toContain("pathname === '/auth/login'");
    expect(shell).toContain('<SocialAuthButtons mode={socialMode} />');
    expect(buttons).toContain('/api/auth/social/${key}/start');
    expect(buttons).toContain('Apple · later');
    expect(buttons).toContain('or continue with email');
    expect(login).toContain("type={showPassword ? 'text' : 'password'}");
    expect(login).toContain("fetch('/api/auth/login'");
    expect(signup).toContain('Create account');
  });

  it('owns the OAuth callback inside DP Resources with state, PKCE and no Supabase-hosted OAuth redirect', () => {
    const helper = read('lib/direct-social-auth.ts');
    const start = read('app/api/auth/social/[provider]/start/route.ts');
    const callback = read('app/api/auth/social/[provider]/callback/route.ts');

    expect(helper).toContain('code_challenge');
    expect(helper).toContain("code_challenge_method', 'S256'");
    expect(helper).toContain('DP_AUTH_ORIGIN');
    expect(helper).toContain('/api/auth/social/${provider}/callback');
    expect(helper).toContain('generateLink');
    expect(helper).toContain('verifyOtp');
    expect(helper).not.toContain('signInWithOAuth');
    expect(start).toContain('sealSocialPayload(transaction)');
    expect(start).toContain('rateLimit');
    expect(callback).toContain("request.nextUrl.searchParams.get('state')");
    expect(callback).toContain('verifyDirectProviderCallback');
  });

  it('uses verified provider identity to preserve same-email accounts and onboard only real new signups', () => {
    const callback = read('app/api/auth/social/[provider]/callback/route.ts');
    const finishPage = read('app/auth/finish-profile/page.tsx');
    const finishRoute = read('app/api/auth/social/finish-profile/route.ts');

    expect(callback).toContain('existingAccountForIdentity');
    expect(callback).toContain("transaction.mode === 'login'");
    expect(callback).toContain("'no_account'");
    expect(callback).toContain('SOCIAL_PENDING_COOKIE');
    expect(finishPage).toContain('openSocialPayload<PendingSocialIdentity>');
    expect(finishRoute).toContain('existingProfileByEmail');
    expect(finishRoute).toContain('dp_resource_username_availability_status');
    expect(finishRoute).toContain('getEmailDomainPolicy');
    expect(finishRoute).toContain('admin.auth.admin.createUser');
    expect(finishRoute).toContain('establishSupabaseSession');
  });

  it('stores provider subjects server-side and prevents ambiguous account linking', () => {
    const callback = read('app/api/auth/social/[provider]/callback/route.ts');
    const identities = read('app/api/account/identities/route.ts');
    const migration = read(
      'supabase/migrations/20260910103500_social_auth_identity_compatibility.sql',
    );

    expect(callback).toContain("from('dp_resource_social_identities')");
    expect(callback).toContain('already belongs to another DP Resources account');
    expect(migration).toContain('unique (provider, provider_subject)');
    expect(migration).toContain('unique (user_id, provider)');
    expect(migration).toContain('revoke all on public.dp_resource_social_identities from public, anon, authenticated');
    expect(identities).toContain("from('dp_resource_social_identities')");
    expect(identities).toContain('sameOriginOrForbidden');
  });

  it('supports Connected Accounts without depending on Supabase social identities', () => {
    const route = read('app/api/account/identities/route.ts');
    const panel = read('components/account/connected-accounts.tsx');
    const settings = read('app/settings/page.tsx');

    expect(route).not.toContain('getUserIdentities');
    expect(route).not.toContain('linkIdentity');
    expect(route).not.toContain('unlinkIdentity');
    expect(route).toContain("mode: 'link'");
    expect(route).toContain('password_enabled');
    expect(panel).toContain('Connected accounts');
    expect(panel).toContain('Confirm disconnect');
    expect(panel).toContain('ManageBac / Faria');
    expect(settings).toContain('<ConnectedAccounts />');
  });

  it('does not weaken the existing auth-user identity validation trigger', () => {
    const migration = read(
      'supabase/migrations/20260910103500_social_auth_identity_compatibility.sql',
    );
    const originalIdentityMigration = read(
      'supabase/migrations/20260707000000_identity_moderation.sql',
    );

    expect(migration).not.toContain('create or replace function public.dp_identity_enforce_auth_user');
    expect(originalIdentityMigration).toContain('dp_identity_validate_username');
    expect(originalIdentityMigration).toContain('dp_identity_validate_full_name');
    expect(migration).toContain('dp_resource_auth_methods');
  });
});

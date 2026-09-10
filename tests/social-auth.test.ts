import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('modern social authentication', () => {
  it('defines only the approved social providers and maps Microsoft to Azure with email scope', () => {
    const providers = read('lib/social-auth.ts');
    expect(providers).toContain("'google'");
    expect(providers).toContain("'microsoft'");
    expect(providers).toContain("'apple'");
    expect(providers).toContain("'github'");
    expect(providers).toContain("supabaseProvider: 'azure'");
    expect(providers).toContain("scopes: 'email'");
  });

  it('shows social options on both login and signup without replacing email/password', () => {
    const shell = read('components/auth-shell.tsx');
    const buttons = read('components/auth/social-auth-buttons.tsx');
    const login = read('app/auth/login/page.tsx');
    const signup = read('app/auth/sign-up/page.tsx');

    expect(shell).toContain("pathname === '/auth/sign-up'");
    expect(shell).toContain("pathname === '/auth/login'");
    expect(shell).toContain('<SocialAuthButtons mode={socialMode} />');
    expect(buttons).toContain('Sign up');
    expect(buttons).toContain('Continue');
    expect(buttons).toContain('or continue with email');
    expect(login).toContain("type=\"password\"");
    expect(signup).toContain('Create account');
  });

  it('starts OAuth server-side with a provider allowlist, PKCE callback and safe internal return path', () => {
    const route = read('app/api/auth/oauth/start/route.ts');
    expect(route).toContain('socialAuthProviderFromInput');
    expect(route).toContain('safeInternalReturnPath');
    expect(route).toContain('signInWithOAuth');
    expect(route).toContain("callback.searchParams.set('flow', 'social')");
    expect(route).toContain('redirectTo: callback.toString()');
    expect(route).toContain('provider.scopes');
    expect(route).toContain('rateLimit');
  });

  it('routes first-time social users through DP Resources profile completion while preserving existing profiles', () => {
    const callback = read('app/auth/callback/route.ts');
    const finishPage = read('app/auth/finish-profile/page.tsx');
    const finishRoute = read('app/api/auth/oauth/finish-profile/route.ts');

    expect(callback).toContain("flow === 'social'");
    expect(callback).toContain("from('dp_resource_profiles')");
    expect(callback).toContain("new URL('/auth/finish-profile'");
    expect(callback).toContain("membership?.is_suspended");
    expect(finishPage).toContain('FinishSocialProfileForm');
    expect(finishRoute).toContain('if (existing)');
    expect(finishRoute).toContain("dp_resource_username_availability_status");
    expect(finishRoute).toContain(".insert({");
    expect(finishRoute).toContain('getEmailDomainPolicy');
  });

  it('supports explicit linking and unlinking without allowing the last identity to be removed', () => {
    const route = read('app/api/account/identities/route.ts');
    const panel = read('components/account/connected-accounts.tsx');
    const settings = read('app/settings/page.tsx');

    expect(route).toContain('getUserIdentities');
    expect(route).toContain('linkIdentity');
    expect(route).toContain('unlinkIdentity');
    expect(route).toContain('identities.length <= 1');
    expect(route).toContain('sameOriginOrForbidden');
    expect(panel).toContain('Connected accounts');
    expect(panel).toContain('Confirm disconnect');
    expect(panel).toContain('ManageBac / Faria');
    expect(settings).toContain('<ConnectedAccounts />');
  });

  it('keeps password signups strict while allowing OAuth users to choose a DP username after provider verification', () => {
    const migration = read(
      'supabase/migrations/20260910103500_social_auth_identity_compatibility.sql',
    );
    expect(migration).toContain("auth_provider = 'email'");
    expect(migration).toContain('metadata_username is not null');
    expect(migration).toContain('metadata_full_name is not null');
    expect(migration).toContain('dp_identity_validate_email_local_part(new.email)');
    expect(migration).toContain(
      'revoke execute on function public.dp_identity_enforce_auth_user()',
    );
  });
});

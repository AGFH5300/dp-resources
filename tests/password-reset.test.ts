import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('password reset flow', () => {
  const loginPage = readFileSync('app/auth/login/page.tsx', 'utf8');
  const forgotPage = readFileSync('app/auth/forgot-password/page.tsx', 'utf8');
  const updatePage = readFileSync('app/auth/update-password/page.tsx', 'utf8');
  const callbackRoute = readFileSync('app/auth/callback/route.ts', 'utf8');

  it('links the login form to password recovery', () => {
    expect(loginPage).toContain('href="/auth/forgot-password"');
  });

  it('sends a privacy-safe reset email through the existing callback', () => {
    expect(forgotPage).toContain('resetPasswordForEmail');
    expect(forgotPage).toContain("new URL('/auth/callback'");
    expect(forgotPage).toContain("'/auth/update-password'");
    expect(forgotPage).toContain('If an account exists');
  });

  it('verifies the recovery session, changes the password, and signs out old sessions', () => {
    expect(updatePage).toContain('supabase.auth.getUser()');
    expect(updatePage).toContain('supabase.auth.updateUser({ password })');
    expect(updatePage).toContain("signOut({ scope: 'global' })");
  });

  it('uses the trusted public origin for production callbacks', () => {
    expect(callbackRoute).toContain(
      "process.env.NODE_ENV === 'production'",
    );
    expect(callbackRoute).toContain('? SITE_URL');
    expect(callbackRoute).toContain('new URL(next, origin)');
    expect(callbackRoute).not.toContain(
      'const { searchParams, origin } = request.nextUrl',
    );
    expect(callbackRoute).not.toContain('`${origin}');
  });

  it('returns invalid recovery callbacks to the request screen', () => {
    expect(callbackRoute).toContain("next === '/auth/update-password'");
    expect(callbackRoute).toContain(
      '/auth/forgot-password?error=invalid_link',
    );
  });
});

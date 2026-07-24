import { describe, expect, it } from 'vitest';
import {
  getSupabaseAuthCookiePrefix,
  hasSupabaseAuthCookie,
  isRecoverableSupabaseAuthError,
  isSupabaseAuthCookieName,
  shouldBypassSupabaseMiddleware,
} from '../middleware';

const SUPABASE_URL = 'https://vwreomwieplqqdrmjcuc.supabase.co';
const AUTH_COOKIE_PREFIX = 'sb-vwreomwieplqqdrmjcuc-auth-token';

describe('middleware auth route bypasses', () => {
  it('excludes public auth routes and auth APIs from Supabase getUser middleware handling', () => {
    const bypassedRoutes = [
      '/',
      '/auth',
      '/auth/login',
      '/auth/forgot-password',
      '/auth/update-password',
      '/auth/sign-up',
      '/auth/verify-otp',
      '/auth/set-password',
      '/auth/sign-up-success',
      '/auth/callback',
      '/api/auth/start-signup',
      '/api/auth/availability',
    ];

    for (const route of bypassedRoutes) {
      expect(shouldBypassSupabaseMiddleware(route)).toBe(true);
    }

    expect(shouldBypassSupabaseMiddleware('/library')).toBe(false);
    expect(shouldBypassSupabaseMiddleware('/admin')).toBe(false);
  });
});

describe('middleware stale session recovery', () => {
  it('derives and recognizes the exact Supabase auth cookie names', () => {
    expect(getSupabaseAuthCookiePrefix(SUPABASE_URL)).toBe(AUTH_COOKIE_PREFIX);
    expect(getSupabaseAuthCookiePrefix('not-a-url')).toBeNull();

    expect(isSupabaseAuthCookieName(AUTH_COOKIE_PREFIX, SUPABASE_URL)).toBe(true);
    expect(
      isSupabaseAuthCookieName(`${AUTH_COOKIE_PREFIX}.0`, SUPABASE_URL),
    ).toBe(true);
    expect(
      isSupabaseAuthCookieName(
        `${AUTH_COOKIE_PREFIX}-code-verifier`,
        SUPABASE_URL,
      ),
    ).toBe(true);
    expect(isSupabaseAuthCookieName('unrelated-cookie', SUPABASE_URL)).toBe(
      false,
    );
  });

  it('does not attempt session validation for signed-out requests', () => {
    expect(hasSupabaseAuthCookie([], SUPABASE_URL)).toBe(false);
    expect(hasSupabaseAuthCookie(['theme'], SUPABASE_URL)).toBe(false);
    expect(
      hasSupabaseAuthCookie([`${AUTH_COOKIE_PREFIX}.0`], SUPABASE_URL),
    ).toBe(true);
  });

  it('recognizes missing, stale, and revoked sessions without swallowing unrelated errors', () => {
    expect(
      isRecoverableSupabaseAuthError({ name: 'AuthSessionMissingError' }),
    ).toBe(true);
    expect(
      isRecoverableSupabaseAuthError({ message: 'Auth session missing!' }),
    ).toBe(true);
    expect(
      isRecoverableSupabaseAuthError({ code: 'refresh_token_not_found' }),
    ).toBe(true);
    expect(
      isRecoverableSupabaseAuthError({
        message: 'Invalid Refresh Token: Refresh Token Not Found',
      }),
    ).toBe(true);
    expect(
      isRecoverableSupabaseAuthError({ code: 'refresh_token_already_used' }),
    ).toBe(true);
    expect(isRecoverableSupabaseAuthError(new Error('Network unavailable'))).toBe(
      false,
    );
  });
});

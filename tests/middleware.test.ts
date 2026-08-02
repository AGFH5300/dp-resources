import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getSupabaseAuthCookiePrefix,
  hasSupabaseAuthCookie,
  isRecoverableSupabaseAuthError,
  isSupabaseAuthCookieName,
  isTransientSupabaseAuthError,
  shouldBypassSupabaseMiddleware,
} from '../middleware';

const middlewareSource = readFileSync('middleware.ts', 'utf8');
const SUPABASE_URL = 'https://vwreomwieplqqdrmjcuc.supabase.co';
const AUTH_COOKIE_PREFIX = 'sb-vwreomwieplqqdrmjcuc-auth-token';

describe('middleware auth route bypasses', () => {
  it('excludes public auth routes and auth APIs from Supabase claims middleware handling', () => {
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
      '/api/question-bank/practice-builder/preview',
      '/api/question-bank/practice-builder/maximize',
      '/api/question-bank/practice-builder/sessions',
      '/api/question-bank/practice-shares',
      '/api/question-bank/practice-shares/ABCD-EFGH',
    ];

    for (const route of bypassedRoutes) {
      expect(shouldBypassSupabaseMiddleware(route)).toBe(true);
    }

    expect(shouldBypassSupabaseMiddleware('/library')).toBe(false);
    expect(shouldBypassSupabaseMiddleware('/admin')).toBe(false);
    expect(shouldBypassSupabaseMiddleware('/api/question-bank/state')).toBe(false);
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

  it('recognizes missing sessions without clearing a concurrent refresh winner', () => {
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
    ).toBe(false);
    expect(
      isTransientSupabaseAuthError({ code: 'refresh_token_already_used' }),
    ).toBe(true);
    expect(
      isTransientSupabaseAuthError({
        message: 'Refresh Token Already Used',
      }),
    ).toBe(true);
    expect(isRecoverableSupabaseAuthError(new Error('Network unavailable'))).toBe(
      false,
    );
  });

  it('uses claims validation instead of parallel user lookups', () => {
    expect(middlewareSource).toContain('supabase.auth.getClaims()');
    expect(middlewareSource).not.toContain('supabase.auth.getUser()');
  });
});

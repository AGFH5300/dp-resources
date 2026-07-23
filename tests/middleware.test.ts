import { describe, expect, it } from 'vitest';
import {
  getSupabaseAuthCookiePrefix,
  isRecoverableSupabaseAuthError,
  shouldBypassSupabaseMiddleware,
} from '../middleware';

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
  it('derives the exact Supabase auth cookie prefix from the project URL', () => {
    expect(
      getSupabaseAuthCookiePrefix('https://vwreomwieplqqdrmjcuc.supabase.co'),
    ).toBe('sb-vwreomwieplqqdrmjcuc-auth-token');
    expect(getSupabaseAuthCookiePrefix('not-a-url')).toBeNull();
  });

  it('recognizes stale and revoked refresh-token failures without swallowing unrelated errors', () => {
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

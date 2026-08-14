import type { CookieOptions } from '@supabase/ssr';

/**
 * DP Resources currently performs Supabase authentication on the server only.
 * Keep auth and PKCE cookies inaccessible to application JavaScript while
 * preserving Supabase's lifetime/domain settings.
 */
export function hardenSupabaseCookieOptions(
  options: CookieOptions = {},
): CookieOptions {
  return {
    ...options,
    path: options.path || '/',
    httpOnly: true,
    sameSite: options.sameSite ?? 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_AUTH_PATHS = new Set([
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
  '/account-suspended',
  '/changelog',
]);

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return { supabaseUrl, supabaseKey };
}

export function shouldBypassSupabaseMiddleware(pathname: string) {
  return PUBLIC_AUTH_PATHS.has(pathname) || pathname.startsWith('/api/auth/');
}

export function getSupabaseAuthCookiePrefix(supabaseUrl: string) {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

export function isRecoverableSupabaseAuthError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
  };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message =
    typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';

  return (
    code === 'refresh_token_not_found' ||
    code === 'refresh_token_already_used' ||
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('refresh token already used')
  );
}

function clearSupabaseAuthCookies(request: NextRequest, supabaseUrl: string) {
  const authCookiePrefix = getSupabaseAuthCookiePrefix(supabaseUrl);
  const authCookieNames = request.cookies
    .getAll()
    .map(({ name }) => name)
    .filter((name) =>
      authCookiePrefix
        ? name === authCookiePrefix ||
          name.startsWith(`${authCookiePrefix}.`) ||
          name.startsWith(`${authCookiePrefix}-`)
        : name.startsWith('sb-') && name.includes('-auth-token'),
    );

  authCookieNames.forEach((name) => request.cookies.delete(name));

  const cleanResponse = NextResponse.next({ request });
  authCookieNames.forEach((name) =>
    cleanResponse.cookies.set(name, '', { maxAge: 0, path: '/' }),
  );
  cleanResponse.headers.set('Cache-Control', 'private, no-store');
  return cleanResponse;
}

export async function middleware(request: NextRequest) {
  if (
    shouldBypassSupabaseMiddleware(request.nextUrl.pathname) ||
    process.env.NODE_ENV === 'development'
  ) {
    return NextResponse.next();
  }

  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  try {
    const { error } = await supabase.auth.getUser();
    if (error && isRecoverableSupabaseAuthError(error)) {
      return clearSupabaseAuthCookies(request, supabaseUrl);
    }
    if (error) {
      console.error('Supabase middleware session validation failed', error);
    }
  } catch (error) {
    if (isRecoverableSupabaseAuthError(error)) {
      return clearSupabaseAuthCookies(request, supabaseUrl);
    }
    console.error('Supabase middleware session validation failed', error);
  }

  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

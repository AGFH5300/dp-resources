import { randomBytes } from 'node:crypto';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@/lib/content-security-policy';
import { getSupabaseServerConfig } from '@/lib/supabase-config';
import { hardenSupabaseCookieOptions } from '@/lib/supabase-cookie-security';

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
  '/privacy',
  '/terms',
]);

export function shouldBypassSupabaseMiddleware(pathname: string) {
  return (
    PUBLIC_AUTH_PATHS.has(pathname) ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/question-bank/practice-builder/') ||
    pathname === '/api/question-bank/practice-shares' ||
    pathname.startsWith('/api/question-bank/practice-shares/')
  );
}

export function getSupabaseAuthCookiePrefix(supabaseUrl: string) {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

export function isSupabaseAuthCookieName(
  cookieName: string,
  supabaseUrl: string,
) {
  const authCookiePrefix = getSupabaseAuthCookiePrefix(supabaseUrl);

  return authCookiePrefix
    ? cookieName === authCookiePrefix ||
        cookieName.startsWith(`${authCookiePrefix}.`) ||
        cookieName.startsWith(`${authCookiePrefix}-`)
    : cookieName.startsWith('sb-') && cookieName.includes('-auth-token');
}

export function hasSupabaseAuthCookie(
  cookieNames: string[],
  supabaseUrl: string,
) {
  return cookieNames.some((name) =>
    isSupabaseAuthCookieName(name, supabaseUrl),
  );
}

function authErrorParts(error: unknown) {
  if (!error || typeof error !== 'object')
    return { name: '', code: '', message: '' };

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };
  return {
    name: typeof candidate.name === 'string' ? candidate.name : '',
    code: typeof candidate.code === 'string' ? candidate.code : '',
    message:
      typeof candidate.message === 'string'
        ? candidate.message.toLowerCase()
        : '',
  };
}

export function isTransientSupabaseAuthError(error: unknown) {
  const { code, message } = authErrorParts(error);
  return (
    code === 'refresh_token_already_used' ||
    message.includes('refresh token already used')
  );
}

export function isRecoverableSupabaseAuthError(error: unknown) {
  const { name, code, message } = authErrorParts(error);

  return (
    name === 'AuthSessionMissingError' ||
    code === 'refresh_token_not_found' ||
    message.includes('auth session missing') ||
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found')
  );
}

function securedNextResponse(
  request: NextRequest,
  nonce: string,
  csp: string,
) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js reads the request CSP nonce and applies it to framework-generated
  // inline/bootstrap scripts. The response carries the same policy for browsers.
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

function clearSupabaseAuthCookies(
  request: NextRequest,
  supabaseUrl: string,
  nonce: string,
  csp: string,
) {
  const authCookieNames = request.cookies
    .getAll()
    .map(({ name }) => name)
    .filter((name) => isSupabaseAuthCookieName(name, supabaseUrl));

  authCookieNames.forEach((name) => request.cookies.delete(name));

  const cleanResponse = securedNextResponse(request, nonce, csp);
  authCookieNames.forEach((name) =>
    cleanResponse.cookies.set(
      name,
      '',
      hardenSupabaseCookieOptions({ maxAge: 0, path: '/' }),
    ),
  );
  cleanResponse.headers.set('Cache-Control', 'private, no-store');
  return cleanResponse;
}

export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'development') return NextResponse.next();

  const nonce = randomBytes(16).toString('base64');
  const csp = contentSecurityPolicy(nonce);

  if (shouldBypassSupabaseMiddleware(request.nextUrl.pathname)) {
    return securedNextResponse(request, nonce, csp);
  }

  const { supabaseUrl, supabaseKey } = getSupabaseServerConfig();

  if (!supabaseUrl || !supabaseKey) {
    return securedNextResponse(request, nonce, csp);
  }

  const requestCookieNames = request.cookies.getAll().map(({ name }) => name);
  if (!hasSupabaseAuthCookie(requestCookieNames, supabaseUrl)) {
    const signedOutResponse = securedNextResponse(request, nonce, csp);
    signedOutResponse.headers.set('Cache-Control', 'private, no-store');
    return signedOutResponse;
  }

  let response = securedNextResponse(request, nonce, csp);
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = securedNextResponse(request, nonce, csp);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(
            name,
            value,
            hardenSupabaseCookieOptions(options),
          ),
        );
      },
    },
  });

  try {
    // getClaims validates the access token without making every parallel page request
    // fetch the same user record and race to rotate a single-use refresh token.
    const { error } = await supabase.auth.getClaims();
    if (error && isTransientSupabaseAuthError(error)) {
      console.warn('Supabase middleware observed a concurrent token refresh', {
        code: error.code,
      });
    } else if (error && isRecoverableSupabaseAuthError(error)) {
      return clearSupabaseAuthCookies(request, supabaseUrl, nonce, csp);
    } else if (error) {
      console.error('Supabase middleware session validation failed', error);
    }
  } catch (error) {
    if (isTransientSupabaseAuthError(error)) {
      console.warn('Supabase middleware observed a concurrent token refresh');
    } else if (isRecoverableSupabaseAuthError(error)) {
      return clearSupabaseAuthCookies(request, supabaseUrl, nonce, csp);
    } else {
      console.error('Supabase middleware session validation failed', error);
    }
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

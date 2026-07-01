import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_AUTH_PATHS = new Set([
  '/',
  '/auth',
  '/auth/login',
  '/auth/sign-up',
  '/auth/verify-otp',
  '/auth/set-password',
  '/auth/sign-up-success',
  '/auth/callback',
]);

export function shouldBypassSupabaseMiddleware(pathname: string) {
  return PUBLIC_AUTH_PATHS.has(pathname) || pathname.startsWith('/api/auth/');
}

export async function middleware(request: NextRequest) {
  if (shouldBypassSupabaseMiddleware(request.nextUrl.pathname) || process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };

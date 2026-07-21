import { safeInternalReturnPath } from '@/lib/auth-redirect';
import { SITE_URL } from '@/lib/seo';
import { createClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

function callbackOrigin(request: NextRequest) {
  return process.env.NODE_ENV === 'production'
    ? SITE_URL
    : request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = callbackOrigin(request);
  const code = searchParams.get('code');
  const next = safeInternalReturnPath(searchParams.get('next'), '/library');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  if (next === '/auth/update-password') {
    return NextResponse.redirect(
      new URL('/auth/forgot-password?error=invalid_link', origin),
    );
  }

  return NextResponse.redirect(new URL('/auth/login', origin));
}

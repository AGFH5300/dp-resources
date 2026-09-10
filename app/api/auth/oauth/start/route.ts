import { NextRequest, NextResponse } from 'next/server';

import { safeInternalReturnPath } from '@/lib/auth-redirect';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
import { SITE_URL } from '@/lib/seo';
import {
  socialAuthModeFromInput,
  socialAuthProviderFromInput,
} from '@/lib/social-auth';
import { createSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function appOrigin(request: NextRequest) {
  return process.env.NODE_ENV === 'production'
    ? SITE_URL
    : request.nextUrl.origin;
}

function authErrorRedirect(
  request: NextRequest,
  provider: string | null,
  mode: 'login' | 'signup',
  reason: 'not_configured' | 'failed' | 'rate_limited',
) {
  const target = new URL(
    mode === 'signup' ? '/auth/sign-up' : '/auth/login',
    appOrigin(request),
  );
  target.searchParams.set('social_error', reason);
  if (provider) target.searchParams.set('social_provider', provider);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const provider = socialAuthProviderFromInput(
    request.nextUrl.searchParams.get('provider'),
  );
  const mode = socialAuthModeFromInput(request.nextUrl.searchParams.get('mode'));
  const next = safeInternalReturnPath(
    request.nextUrl.searchParams.get('next'),
    '/library',
  );

  if (!provider) {
    return authErrorRedirect(request, null, mode, 'failed');
  }

  const limit = await rateLimit(
    privacySafeRequestKey(request, `oauth-start:${provider.key}`),
    30,
    10 * 60 * 1000,
    'oauth_start',
  );
  if (!limit.ok) {
    const response = authErrorRedirect(
      request,
      provider.key,
      mode,
      'rate_limited',
    );
    response.headers.set('Retry-After', String(Math.max(1, limit.retryAfter)));
    return response;
  }

  const origin = appOrigin(request);
  const callback = new URL('/auth/callback', origin);
  callback.searchParams.set('flow', 'social');
  callback.searchParams.set('provider', provider.key);
  callback.searchParams.set('mode', mode);
  callback.searchParams.set('next', next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider.supabaseProvider,
    options: {
      redirectTo: callback.toString(),
      ...(provider.scopes ? { scopes: provider.scopes } : {}),
    },
  });

  if (error || !data.url) {
    console.error('Unable to start social authentication.', {
      provider: provider.key,
      message: error?.message || 'No provider authorization URL returned.',
    });
    return authErrorRedirect(request, provider.key, mode, 'not_configured');
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

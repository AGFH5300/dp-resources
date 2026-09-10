import { NextRequest, NextResponse } from 'next/server';

import { requireApiMember } from '@/lib/auth';
import {
  SOCIAL_COOKIE_MAX_AGE,
  SOCIAL_OAUTH_COOKIE,
  appAuthOrigin,
  createSocialOAuthTransaction,
  directProviderCallbackUrl,
  directProviderFromInput,
  isDirectProviderConfigured,
  providerAuthorizationUrl,
  sealSocialPayload,
} from '@/lib/direct-social-auth';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
import { socialAuthModeFromInput, socialAuthProviderFromInput } from '@/lib/social-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorRedirect(
  request: NextRequest,
  provider: string | null,
  mode: 'login' | 'signup' | 'link',
  reason: 'failed' | 'not_configured' | 'rate_limited',
) {
  const origin = appAuthOrigin(request);
  const path = mode === 'link' ? '/settings' : mode === 'signup' ? '/auth/sign-up' : '/auth/login';
  const target = new URL(path, origin);
  target.searchParams.set('social_error', mode === 'link' ? 'link_failed' : reason);
  if (provider) target.searchParams.set('social_provider', provider);
  if (mode === 'link') target.hash = 'connected-accounts';
  return NextResponse.redirect(target);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await context.params;
  const publicProvider = socialAuthProviderFromInput(providerParam);
  const provider = directProviderFromInput(providerParam);
  const requestedMode = request.nextUrl.searchParams.get('mode');
  const mode = requestedMode === 'link' ? 'link' : socialAuthModeFromInput(requestedMode);

  if (!publicProvider || !provider) {
    return errorRedirect(request, publicProvider?.key || null, mode, 'not_configured');
  }

  const limited = await rateLimit(
    privacySafeRequestKey(request, `direct-oauth-start:${provider}`),
    30,
    10 * 60 * 1000,
    'direct_oauth_start',
  );
  if (!limited.ok) {
    const response = errorRedirect(request, provider, mode, 'rate_limited');
    response.headers.set('Retry-After', String(Math.max(1, limited.retryAfter)));
    return response;
  }

  let linkUserId: string | undefined;
  if (mode === 'link') {
    const auth = await requireApiMember();
    if (!auth.ok) return auth.response;
    linkUserId = auth.user.id;
  }

  if (!isDirectProviderConfigured(provider)) {
    return errorRedirect(request, provider, mode, 'not_configured');
  }

  try {
    const origin = appAuthOrigin(request);
    const transaction = createSocialOAuthTransaction({
      provider,
      mode,
      next: request.nextUrl.searchParams.get('next'),
      linkUserId,
    });
    const callbackUrl = directProviderCallbackUrl(origin, provider);
    const response = NextResponse.redirect(providerAuthorizationUrl(transaction, callbackUrl));
    response.cookies.set(SOCIAL_OAUTH_COOKIE, sealSocialPayload(transaction), {
      httpOnly: true,
      sameSite: 'lax',
      secure: callbackUrl.startsWith('https://'),
      path: '/api/auth/social',
      maxAge: SOCIAL_COOKIE_MAX_AGE,
    });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    console.error('Unable to start direct social authentication.', {
      provider,
      message: error instanceof Error ? error.message : String(error),
    });
    return errorRedirect(request, provider, mode, 'failed');
  }
}

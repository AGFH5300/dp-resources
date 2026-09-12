import { NextRequest, NextResponse } from 'next/server';

import {
  SOCIAL_COOKIE_MAX_AGE,
  SOCIAL_OAUTH_COOKIE,
  SOCIAL_PENDING_COOKIE,
  appAuthOrigin,
  directProviderCallbackUrl,
  directProviderFromInput,
  establishSupabaseSession,
  openSocialPayload,
  sealSocialPayload,
  verifyDirectProviderCallback,
  type PendingSocialIdentity,
  type SocialOAuthTransaction,
  type VerifiedSocialIdentity,
} from '@/lib/direct-social-auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { SOCIAL_AUTH_PROVIDERS } from '@/lib/social-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SocialIdentityRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_subject: string;
  provider_email: string | null;
};

type ProfileRow = {
  id: string;
  email: string;
};

type MembershipRow = {
  is_suspended: boolean | null;
};

function clearOAuthCookie(response: NextResponse) {
  response.cookies.set(SOCIAL_OAUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/api/auth/social',
    maxAge: 0,
  });
  return response;
}

function socialErrorRedirect(
  origin: string,
  provider: string,
  mode: 'login' | 'signup' | 'link',
  reason: string,
) {
  const path = mode === 'link' ? '/settings' : mode === 'signup' ? '/auth/sign-up' : '/auth/login';
  const target = new URL(path, origin);
  target.searchParams.set('social_error', mode === 'link' ? 'link_failed' : reason);
  target.searchParams.set('social_provider', provider);
  if (mode === 'link') target.hash = 'connected-accounts';
  return clearOAuthCookie(NextResponse.redirect(target));
}

function pendingSignupResponse({
  origin,
  identity,
  next,
  showCreatePrompt,
}: {
  origin: string;
  identity: VerifiedSocialIdentity;
  next: string;
  showCreatePrompt: boolean;
}) {
  const pending: PendingSocialIdentity = {
    version: 1,
    ...identity,
    next,
    expiresAt: Date.now() + SOCIAL_COOKIE_MAX_AGE * 1000,
  };

  const target = new URL(showCreatePrompt ? '/auth/login' : '/auth/finish-profile', origin);
  if (showCreatePrompt) {
    target.searchParams.set('social_error', 'no_account');
    target.searchParams.set('social_provider', identity.provider);
    target.searchParams.set('next', next);
  } else {
    target.searchParams.set('provider', identity.provider);
    target.searchParams.set('next', next);
  }

  const response = clearOAuthCookie(NextResponse.redirect(target));
  response.cookies.set(SOCIAL_PENDING_COOKIE, sealSocialPayload(pending), {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https://'),
    path: '/',
    maxAge: SOCIAL_COOKIE_MAX_AGE,
  });
  return response;
}

async function profileByEmail(email: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('dp_resource_profiles')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle<ProfileRow>();
  if (error) throw new Error(`Could not resolve DP Resources account: ${error.message}`);
  return data;
}

async function profileById(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('dp_resource_profiles')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();
  if (error) throw new Error(`Could not load DP Resources profile: ${error.message}`);
  return data;
}

async function providerIdentity(provider: string, subject: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('dp_resource_social_identities')
    .select('id, user_id, provider, provider_subject, provider_email')
    .eq('provider', provider)
    .eq('provider_subject', subject)
    .maybeSingle<SocialIdentityRow>();
  if (error) throw new Error(`Could not resolve connected account: ${error.message}`);
  return data;
}

async function identityForUserProvider(userId: string, provider: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('dp_resource_social_identities')
    .select('id, user_id, provider, provider_subject, provider_email')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle<SocialIdentityRow>();
  if (error) throw new Error(`Could not resolve connected provider: ${error.message}`);
  return data;
}

async function attachIdentity(userId: string, identity: VerifiedSocialIdentity) {
  const admin = createSupabaseAdminClient();
  const existingForProvider = await identityForUserProvider(userId, identity.provider);
  if (existingForProvider) {
    if (existingForProvider.provider_subject !== identity.subject) {
      throw new Error('A different account from this provider is already connected.');
    }
    const { error } = await admin
      .from('dp_resource_social_identities')
      .update({
        provider_email: identity.email,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingForProvider.id);
    if (error) throw new Error(`Could not refresh connected account: ${error.message}`);
    return;
  }

  const claimed = await providerIdentity(identity.provider, identity.subject);
  if (claimed && claimed.user_id !== userId) {
    throw new Error('This provider account is already connected to another DP Resources account.');
  }
  if (claimed) return;

  const { error } = await admin.from('dp_resource_social_identities').insert({
    user_id: userId,
    provider: identity.provider,
    provider_subject: identity.subject,
    provider_email: identity.email,
    last_used_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not connect provider account: ${error.message}`);
}

async function isSuspended(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('dp_resource_memberships')
    .select('is_suspended')
    .eq('id', userId)
    .maybeSingle<MembershipRow>();
  if (error) throw new Error(`Could not verify account status: ${error.message}`);
  return data?.is_suspended === true;
}

async function linkIdentity(
  transaction: SocialOAuthTransaction,
  identity: VerifiedSocialIdentity,
) {
  if (!transaction.linkUserId) throw new Error('The account-linking session is incomplete.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== transaction.linkUserId) {
    throw new Error('Sign in again before connecting another account.');
  }

  const sameEmailProfile = await profileByEmail(identity.email);
  if (sameEmailProfile && sameEmailProfile.id !== user.id) {
    throw new Error('That provider email already belongs to another DP Resources account.');
  }

  await attachIdentity(user.id, identity);
}

async function existingAccountForIdentity(identity: VerifiedSocialIdentity) {
  const claimed = await providerIdentity(identity.provider, identity.subject);
  if (!claimed) return null;

  const profile = await profileById(claimed.user_id);
  if (!profile) throw new Error('The connected DP Resources profile no longer exists.');
  await attachIdentity(claimed.user_id, identity);
  return profile;
}

async function existingAccountForTrustedEmail(identity: VerifiedSocialIdentity) {
  // Google and GitHub explicitly verify the returned email before this point.
  // Microsoft documents email/UPN as mutable and unsuitable for authorization,
  // so Microsoft accounts must be linked explicitly from an authenticated session.
  if (identity.provider === 'microsoft') return null;

  const profile = await profileByEmail(identity.email);
  if (!profile) return null;
  await attachIdentity(profile.id, identity);
  return profile;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  let origin: string;
  try {
    origin = appAuthOrigin(request);
  } catch {
    origin = request.nextUrl.origin;
  }

  const { provider: providerParam } = await context.params;
  const provider = directProviderFromInput(providerParam);
  const transaction = openSocialPayload<SocialOAuthTransaction>(
    request.cookies.get(SOCIAL_OAUTH_COOKIE)?.value,
  );
  const fallbackMode = transaction?.mode || 'login';

  if (!provider || !transaction || transaction.provider !== provider) {
    return socialErrorRedirect(origin, providerParam, fallbackMode, 'failed');
  }
  if (transaction.expiresAt < Date.now()) {
    return socialErrorRedirect(origin, provider, transaction.mode, 'failed');
  }
  if (!request.nextUrl.searchParams.get('state') || request.nextUrl.searchParams.get('state') !== transaction.state) {
    return socialErrorRedirect(origin, provider, transaction.mode, 'failed');
  }
  if (request.nextUrl.searchParams.get('error')) {
    return socialErrorRedirect(origin, provider, transaction.mode, 'cancelled');
  }

  const code = request.nextUrl.searchParams.get('code');
  if (!code) return socialErrorRedirect(origin, provider, transaction.mode, 'failed');

  try {
    const callbackUrl = directProviderCallbackUrl(origin, provider);
    const identity = await verifyDirectProviderCallback({
      provider,
      code,
      callbackUrl,
      verifier: transaction.verifier,
    });

    if (transaction.mode === 'link') {
      await linkIdentity(transaction, identity);
      const target = new URL('/settings', origin);
      target.searchParams.set('linked', provider);
      target.hash = 'connected-accounts';
      return clearOAuthCookie(NextResponse.redirect(target));
    }

    const existingBySubject = await existingAccountForIdentity(identity);

    if (!existingBySubject && identity.provider === 'microsoft') {
      const sameEmailProfile = await profileByEmail(identity.email);
      if (sameEmailProfile) {
        return socialErrorRedirect(origin, provider, transaction.mode, 'link_required');
      }
    }

    const existing = existingBySubject || (await existingAccountForTrustedEmail(identity));
    if (existing) {
      if (await isSuspended(existing.id)) {
        return socialErrorRedirect(origin, provider, transaction.mode, 'account_suspended');
      }
      await establishSupabaseSession(existing.id, existing.email);
      return clearOAuthCookie(
        NextResponse.redirect(new URL(transaction.next, origin)),
      );
    }

    return pendingSignupResponse({
      origin,
      identity,
      next: transaction.next,
      showCreatePrompt: transaction.mode === 'login',
    });
  } catch (error) {
    console.error('Direct social authentication callback failed.', {
      provider,
      label: SOCIAL_AUTH_PROVIDERS[provider].label,
      message: error instanceof Error ? error.message : String(error),
    });
    return socialErrorRedirect(origin, provider, transaction.mode, 'failed');
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { getEmailDomainPolicy } from '@/lib/disposable-email';
import {
  SOCIAL_PENDING_COOKIE,
  establishSupabaseSession,
  openSocialPayload,
  type PendingSocialIdentity,
} from '@/lib/direct-social-auth';
import {
  logIdentityRejection,
  validateEmailLocalPartIdentity,
  validateFullNameIdentity,
  validateUsernameIdentity,
} from '@/lib/identity-moderation';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

type FinishProfileRequest = {
  username?: string;
  fullName?: string;
};

type ProfileRow = {
  id: string;
  email: string;
};

type IdentityRow = {
  id: string;
  user_id: string;
  provider_subject: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

function clearPending(response: NextResponse) {
  response.cookies.set(SOCIAL_PENDING_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}

async function existingProfileByEmail(email: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('dp_resource_profiles')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle<ProfileRow>();
  if (error) throw new Error(`Could not resolve existing profile: ${error.message}`);
  return data;
}

async function ensureIdentity(userId: string, pending: PendingSocialIdentity) {
  const admin = createSupabaseAdminClient();
  const { data: claimed, error: claimedError } = await admin
    .from('dp_resource_social_identities')
    .select('id, user_id, provider_subject')
    .eq('provider', pending.provider)
    .eq('provider_subject', pending.subject)
    .maybeSingle<IdentityRow>();
  if (claimedError) throw new Error(`Could not verify provider identity: ${claimedError.message}`);
  if (claimed && claimed.user_id !== userId) {
    throw new Error('This provider account is already connected to another DP Resources account.');
  }

  const { data: sameProvider, error: providerError } = await admin
    .from('dp_resource_social_identities')
    .select('id, user_id, provider_subject')
    .eq('user_id', userId)
    .eq('provider', pending.provider)
    .maybeSingle<IdentityRow>();
  if (providerError) throw new Error(`Could not verify connected provider: ${providerError.message}`);
  if (sameProvider && sameProvider.provider_subject !== pending.subject) {
    throw new Error('A different account from this provider is already connected.');
  }

  if (claimed || sameProvider) {
    const id = claimed?.id || sameProvider?.id;
    const { error } = await admin
      .from('dp_resource_social_identities')
      .update({
        provider_email: pending.email,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id!);
    if (error) throw new Error(`Could not refresh provider identity: ${error.message}`);
    return;
  }

  const { error } = await admin.from('dp_resource_social_identities').insert({
    user_id: userId,
    provider: pending.provider,
    provider_subject: pending.subject,
    provider_email: pending.email,
    last_used_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not connect provider identity: ${error.message}`);
}

export async function POST(request: NextRequest) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const limited = await rateLimit(
    privacySafeRequestKey(request, 'direct-social-finish-profile'),
    12,
    10 * 60 * 1000,
    'direct_social_finish_profile',
  );
  if (!limited.ok) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429);
  }

  const pending = openSocialPayload<PendingSocialIdentity>(
    request.cookies.get(SOCIAL_PENDING_COOKIE)?.value,
  );
  if (!pending || pending.version !== 1 || pending.expiresAt < Date.now()) {
    return clearPending(json({ error: 'Your social sign-up session expired. Start again.' }, 401));
  }

  let payload: FinishProfileRequest;
  try {
    payload = (await request.json()) as FinishProfileRequest;
  } catch {
    return json({ error: 'Could not read profile details.' }, 400);
  }

  const username = payload.username?.trim() || '';
  const fullName = payload.fullName?.trim() || '';
  const email = pending.email.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    return json(
      {
        error: 'Use 3-24 characters: letters, numbers, or underscore.',
        field: 'username',
      },
      400,
    );
  }

  const usernamePolicy = validateUsernameIdentity(username);
  if (!usernamePolicy.ok) {
    logIdentityRejection('direct-social-finish-profile', usernamePolicy.reason);
    return json({ error: 'Choose a different username.', field: 'username' }, 400);
  }

  const fullNamePolicy = validateFullNameIdentity(fullName);
  if (!fullNamePolicy.ok) {
    logIdentityRejection('direct-social-finish-profile', fullNamePolicy.reason);
    return json({ error: 'Enter an appropriate name.', field: 'fullName' }, 400);
  }

  const emailPolicy = validateEmailLocalPartIdentity(email);
  if (!email || !emailPolicy.ok) {
    if (!emailPolicy.ok) logIdentityRejection('direct-social-finish-profile', emailPolicy.reason);
    return clearPending(
      json({ error: 'This provider did not return an acceptable email address.' }, 400),
    );
  }

  const admin = createSupabaseAdminClient();

  try {
    const domainPolicy = await getEmailDomainPolicy(admin, email);
    if (domainPolicy.allowed !== true) {
      return clearPending(
        json(
          {
            error:
              'This email provider is not accepted for new DP Resources accounts. Sign in with another account.',
            field: 'form',
          },
          400,
        ),
      );
    }

    // A same-email account may have appeared since the provider callback. Treat
    // that as the same DP Resources account rather than creating a duplicate.
    const existing = await existingProfileByEmail(email);
    if (existing) {
      await ensureIdentity(existing.id, pending);
      await establishSupabaseSession(existing.id, existing.email);
      return clearPending(json({ ok: true, existingAccount: true }));
    }

    const { data: usernameStatus, error: usernameError } = await admin.rpc(
      'dp_resource_username_availability_status',
      { p_username: username },
    );
    if (usernameError) {
      return json({ error: 'Could not validate that username right now.' }, 503);
    }
    if (usernameStatus !== 'available') {
      return json(
        {
          error:
            usernameStatus === 'invalid'
              ? 'Choose a different username.'
              : 'That username is already taken.',
          field: 'username',
        },
        409,
      );
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        username,
        full_name: fullName,
        social_signup_provider: pending.provider,
      },
    });
    if (createError || !created.user) {
      return json(
        {
          error:
            createError?.message?.toLowerCase().includes('already')
              ? 'This email already has a DP Resources account. Log in instead.'
              : 'Could not create your DP Resources account.',
        },
        createError?.message?.toLowerCase().includes('already') ? 409 : 503,
      );
    }

    const userId = created.user.id;
    let setupComplete = false;
    try {
      const { error: profileError } = await admin.from('dp_resource_profiles').insert({
        id: userId,
        username,
        full_name: fullName,
        email,
      });
      if (profileError) {
        throw new Error(`Could not create DP Resources profile: ${profileError.message}`);
      }

      const { error: methodError } = await admin.from('dp_resource_auth_methods').upsert({
        user_id: userId,
        password_enabled: false,
        updated_at: new Date().toISOString(),
      });
      if (methodError) {
        throw new Error(`Could not initialize account sign-in methods: ${methodError.message}`);
      }

      await ensureIdentity(userId, pending);
      setupComplete = true;
    } finally {
      if (!setupComplete) {
        await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      }
    }

    await establishSupabaseSession(userId, email);
    return clearPending(json({ ok: true, existingAccount: false }));
  } catch (error) {
    console.error('Unable to finish direct social profile.', {
      provider: pending.provider,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: 'Could not finish creating your DP Resources account.' }, 503);
  }
}

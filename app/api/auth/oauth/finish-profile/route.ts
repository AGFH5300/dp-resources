import { NextResponse } from 'next/server';

import { requireApiMember } from '@/lib/auth';
import { getEmailDomainPolicy } from '@/lib/disposable-email';
import {
  logIdentityRejection,
  validateEmailLocalPartIdentity,
  validateFullNameIdentity,
  validateUsernameIdentity,
} from '@/lib/identity-moderation';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

type FinishProfileRequest = {
  username?: string;
  fullName?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;

  let payload: FinishProfileRequest;
  try {
    payload = (await request.json()) as FinishProfileRequest;
  } catch {
    return json({ error: 'Could not read profile details.' }, 400);
  }

  const username = payload.username?.trim() || '';
  const fullName = payload.fullName?.trim() || '';
  const email = auth.user.email?.trim().toLowerCase() || '';

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
    logIdentityRejection('oauth-finish-profile', usernamePolicy.reason);
    return json(
      { error: 'Choose a different username.', field: 'username' },
      400,
    );
  }

  const fullNamePolicy = validateFullNameIdentity(fullName);
  if (!fullNamePolicy.ok) {
    logIdentityRejection('oauth-finish-profile', fullNamePolicy.reason);
    return json(
      { error: 'Enter an appropriate name.', field: 'fullName' },
      400,
    );
  }

  const emailPolicy = validateEmailLocalPartIdentity(email);
  if (!email || !emailPolicy.ok) {
    if (!emailPolicy.ok) {
      logIdentityRejection('oauth-finish-profile', emailPolicy.reason);
    }
    return json(
      { error: 'This provider did not return an acceptable email address.' },
      400,
    );
  }

  const supabase = await createClient();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseAdminClient()
    : supabase;

  const { data: existing, error: existingError } = await supabase
    .from('dp_resource_profiles')
    .select('id, username, full_name, email')
    .eq('id', auth.user.id)
    .maybeSingle<{
      id: string;
      username: string;
      full_name: string;
      email: string;
    }>();

  if (existingError) {
    return json({ error: 'Could not verify your DP Resources profile.' }, 500);
  }

  if (existing) {
    return json({ ok: true, profile: existing });
  }

  try {
    const domainPolicy = await getEmailDomainPolicy(admin, email);
    if (domainPolicy.allowed !== true) {
      return json(
        {
          error:
            'This email provider is not accepted for new DP Resources accounts. Sign in with another account.',
          field: 'form',
        },
        400,
      );
    }
  } catch {
    return json({ error: 'Could not validate your email right now.' }, 503);
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

  const { data: profile, error: insertError } = await supabase
    .from('dp_resource_profiles')
    .insert({
      id: auth.user.id,
      username,
      full_name: fullName,
      email,
    })
    .select('id, username, full_name, email')
    .single();

  if (insertError) {
    const duplicate = insertError.code === '23505';
    return json(
      {
        error: duplicate
          ? 'That username is already taken.'
          : 'Could not create your DP Resources profile.',
        ...(duplicate ? { field: 'username' } : {}),
      },
      duplicate ? 409 : 500,
    );
  }

  const currentMetadata =
    auth.user.user_metadata && typeof auth.user.user_metadata === 'object'
      ? auth.user.user_metadata
      : {};
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      ...currentMetadata,
      username,
      full_name: fullName,
    },
  });
  if (metadataError) {
    console.error('Unable to synchronize social profile metadata.', {
      userId: auth.user.id,
      message: metadataError.message,
    });
  }

  return json({ ok: true, profile });
}

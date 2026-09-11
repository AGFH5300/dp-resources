import { NextRequest, NextResponse } from 'next/server';

import { requireApiMember } from '@/lib/auth';
import {
  appAuthOrigin,
  directProviderFromInput,
  isDirectProviderConfigured,
} from '@/lib/direct-social-auth';
import { sameOriginOrForbidden } from '@/lib/request-security';
import {
  SOCIAL_AUTH_PROVIDER_KEYS,
  SOCIAL_AUTH_PROVIDERS,
  socialAuthProviderFromInput,
} from '@/lib/social-auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type IdentityChangeRequest = {
  provider?: string;
  identityId?: string;
};

type IdentityRow = {
  id: string;
  provider: string;
  provider_email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export async function GET() {
  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  const [{ data: rows, error }, { data: methods, error: methodsError }] = await Promise.all([
    admin
      .from('dp_resource_social_identities')
      .select('id, provider, provider_email, created_at, updated_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: true }),
    admin
      .from('dp_resource_auth_methods')
      .select('password_enabled')
      .eq('user_id', auth.user.id)
      .maybeSingle<{ password_enabled: boolean }>(),
  ]);

  if (error || methodsError) {
    return json({ error: 'Could not load connected accounts.' }, 500);
  }

  const identities = ((rows || []) as IdentityRow[])
    .map((identity) => {
      const provider = socialAuthProviderFromInput(identity.provider);
      if (!provider) return null;
      return {
        id: identity.id,
        provider: provider.key,
        label: provider.label,
        email: identity.provider_email,
        createdAt: identity.created_at,
        updatedAt: identity.updated_at,
      };
    })
    .filter(Boolean);
  const connected = new Set(
    identities.map((identity) => identity?.provider).filter(Boolean),
  );

  return json({
    identities,
    passwordEnabled: methods?.password_enabled === true,
    providers: SOCIAL_AUTH_PROVIDER_KEYS.map((key) => ({
      key,
      label: SOCIAL_AUTH_PROVIDERS[key].label,
      connected: connected.has(key),
      available: isDirectProviderConfigured(key),
    })),
  });
}

export async function POST(request: NextRequest) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;

  let payload: IdentityChangeRequest;
  try {
    payload = (await request.json()) as IdentityChangeRequest;
  } catch {
    return json({ error: 'Could not read the connected-account request.' }, 400);
  }

  const publicProvider = socialAuthProviderFromInput(payload.provider);
  const provider = directProviderFromInput(payload.provider);
  if (!publicProvider || !provider) {
    return json({ error: 'That account provider is not available yet.' }, 400);
  }
  if (!isDirectProviderConfigured(provider)) {
    return json({ error: `${publicProvider.label} sign-in is not configured yet.` }, 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error } = await admin
    .from('dp_resource_social_identities')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('provider', provider)
    .maybeSingle<{ id: string }>();
  if (error) return json({ error: 'Could not verify connected accounts.' }, 500);
  if (existing) return json({ error: `${publicProvider.label} is already connected.` }, 409);

  const origin = appAuthOrigin(request);
  const query = new URLSearchParams({ mode: 'link', next: '/settings' });
  return json({
    ok: true,
    url: `${origin}/api/auth/social/${provider}/start?${query.toString()}`,
  });
}

export async function DELETE(request: NextRequest) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;

  let payload: IdentityChangeRequest;
  try {
    payload = (await request.json()) as IdentityChangeRequest;
  } catch {
    return json({ error: 'Could not read the connected-account request.' }, 400);
  }

  const identityId = payload.identityId?.trim();
  if (!identityId) return json({ error: 'Identity is required.' }, 400);

  const admin = createSupabaseAdminClient();
  const [{ data: identity, error }, { data: identities, error: identitiesError }, { data: methods, error: methodsError }] =
    await Promise.all([
      admin
        .from('dp_resource_social_identities')
        .select('id, provider')
        .eq('id', identityId)
        .eq('user_id', auth.user.id)
        .maybeSingle<{ id: string; provider: string }>(),
      admin
        .from('dp_resource_social_identities')
        .select('id')
        .eq('user_id', auth.user.id),
      admin
        .from('dp_resource_auth_methods')
        .select('password_enabled')
        .eq('user_id', auth.user.id)
        .maybeSingle<{ password_enabled: boolean }>(),
    ]);

  if (error || identitiesError || methodsError) {
    return json({ error: 'Could not verify connected accounts.' }, 500);
  }
  const provider = socialAuthProviderFromInput(identity?.provider);
  if (!identity || !provider) {
    return json({ error: 'That connected account could not be found.' }, 404);
  }

  const passwordEnabled = methods?.password_enabled === true;
  if (!passwordEnabled && (identities?.length || 0) <= 1) {
    return json(
      {
        error:
          'Set a DP Resources password or connect another provider before disconnecting your only sign-in method.',
      },
      409,
    );
  }

  const { error: deleteError } = await admin
    .from('dp_resource_social_identities')
    .delete()
    .eq('id', identity.id)
    .eq('user_id', auth.user.id);
  if (deleteError) {
    return json({ error: `Could not disconnect ${provider.label}.` }, 500);
  }

  return json({ ok: true, disconnected: provider.key });
}

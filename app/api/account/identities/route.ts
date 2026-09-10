import { NextRequest, NextResponse } from 'next/server';

import { requireApiMember } from '@/lib/auth';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { SITE_URL } from '@/lib/seo';
import {
  SOCIAL_AUTH_PROVIDER_KEYS,
  SOCIAL_AUTH_PROVIDERS,
  socialAuthProviderFromInput,
  socialAuthProviderFromSupabase,
} from '@/lib/social-auth';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type IdentityChangeRequest = {
  provider?: string;
  identityId?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

function appOrigin(request: NextRequest) {
  return process.env.NODE_ENV === 'production'
    ? SITE_URL
    : request.nextUrl.origin;
}

function publicIdentity(identity: {
  id: string;
  provider: string;
  created_at?: string;
  updated_at?: string;
  identity_data?: Record<string, unknown>;
}) {
  const provider = socialAuthProviderFromSupabase(identity.provider);
  if (!provider) return null;
  const email = identity.identity_data?.email;
  return {
    id: identity.id,
    provider: provider.key,
    label: provider.label,
    email: typeof email === 'string' ? email : null,
    createdAt: identity.created_at || null,
    updatedAt: identity.updated_at || null,
  };
}

export async function GET() {
  const auth = await requireApiMember();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) {
    return json({ error: 'Could not load connected accounts.' }, 500);
  }

  const identities = (data?.identities || [])
    .map((identity) => publicIdentity(identity))
    .filter(Boolean);
  const connected = new Set(
    identities.map((identity) => identity?.provider).filter(Boolean),
  );

  return json({
    identities,
    providers: SOCIAL_AUTH_PROVIDER_KEYS.map((key) => ({
      key,
      label: SOCIAL_AUTH_PROVIDERS[key].label,
      connected: connected.has(key),
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

  const provider = socialAuthProviderFromInput(payload.provider);
  if (!provider) return json({ error: 'Unsupported account provider.' }, 400);

  const supabase = await createClient();
  const { data: currentData, error: currentError } =
    await supabase.auth.getUserIdentities();
  if (currentError) {
    return json({ error: 'Could not verify connected accounts.' }, 500);
  }

  if (
    (currentData?.identities || []).some(
      (identity) => identity.provider === provider.supabaseProvider,
    )
  ) {
    return json({ error: `${provider.label} is already connected.` }, 409);
  }

  const callback = new URL('/auth/callback', appOrigin(request));
  callback.searchParams.set('flow', 'link');
  callback.searchParams.set('provider', provider.key);
  callback.searchParams.set('next', '/settings');

  const { data, error } = await supabase.auth.linkIdentity({
    provider: provider.supabaseProvider,
    options: {
      redirectTo: callback.toString(),
      ...(provider.scopes ? { scopes: provider.scopes } : {}),
    },
  });

  if (error || !data?.url) {
    console.error('Unable to start identity linking.', {
      userId: auth.user.id,
      provider: provider.key,
      message: error?.message || 'No provider authorization URL returned.',
    });
    return json(
      {
        error:
          'Could not start account linking. The provider may not be enabled yet.',
      },
      400,
    );
  }

  return json({ ok: true, url: data.url });
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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) return json({ error: 'Could not verify connected accounts.' }, 500);

  const identities = data?.identities || [];
  const identity = identities.find((candidate) => candidate.id === identityId);
  const provider = socialAuthProviderFromSupabase(identity?.provider);
  if (!identity || !provider) {
    return json({ error: 'That connected account could not be found.' }, 404);
  }

  if (identities.length <= 1) {
    return json(
      {
        error:
          'Add another sign-in method before disconnecting your only account.',
      },
      409,
    );
  }

  const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
  if (unlinkError) {
    return json({ error: `Could not disconnect ${provider.label}.` }, 400);
  }

  return json({ ok: true, disconnected: provider.key });
}

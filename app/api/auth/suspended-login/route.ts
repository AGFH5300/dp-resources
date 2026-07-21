import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isSuspendedAuthError } from '@/lib/suspension-auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';

type SuspendedLoginRequest = {
  email?: string;
  password?: string;
};

type SuspendedMembership = {
  id: string;
  is_suspended: boolean;
  suspension_reason: string | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

function createCredentialCheckClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const limited = await rateLimit(
    privacySafeRequestKey(request, 'suspended-login'),
    10,
    10 * 60 * 1000,
    'suspended-login',
  );
  if (!limited.ok) {
    return json(
      {
        suspended: false,
        message: 'Too many login attempts. Please try again later.',
      },
      429,
    );
  }

  let payload: SuspendedLoginRequest;
  try {
    payload = (await request.json()) as SuspendedLoginRequest;
  } catch {
    return json({ suspended: false }, 400);
  }

  const email = payload.email?.trim().toLowerCase() ?? '';
  const password = payload.password ?? '';
  if (!email || !password || email.length > 320 || password.length > 4096) {
    return json({ suspended: false }, 400);
  }

  const credentialClient = createCredentialCheckClient();
  if (!credentialClient) return json({ suspended: false }, 503);

  const { error: authError } =
    await credentialClient.auth.signInWithPassword({ email, password });

  // Supabase returns the banned-user error only after the supplied credentials
  // have been validated. Never query or reveal moderation data otherwise.
  if (!authError || !isSuspendedAuthError(authError)) {
    return json({ suspended: false }, 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from('dp_resource_memberships')
    .select('id,is_suspended,suspension_reason')
    .ilike('email', email)
    .maybeSingle<SuspendedMembership>();

  if (membershipError) {
    console.error('[suspended-login] membership lookup failed', {
      code: membershipError.code,
      message: membershipError.message,
    });
  }

  return json({
    suspended: true,
    userId: membership?.is_suspended ? membership.id : null,
    suspensionReason:
      membership?.is_suspended === true
        ? (membership.suspension_reason ?? null)
        : null,
  });
}

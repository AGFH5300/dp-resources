import { NextResponse } from 'next/server';

import {
  INVALID_LOGIN_EMAIL,
  normalizeLoginIdentifier,
  resolveLoginEmail,
} from '@/lib/login-identifier';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
import { isSuspendedAuthError } from '@/lib/suspension-auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const GENERIC_LOGIN_MESSAGE = 'Invalid username/email or password.';
const SUSPENDED_MESSAGE =
  'This account has been suspended. Contact the site administrator if you believe this is a mistake.';

type LoginRequest = {
  identifier?: string;
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

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const limited = await rateLimit(
    privacySafeRequestKey(request, 'login'),
    12,
    10 * 60 * 1000,
    'login',
  );
  if (!limited.ok) {
    return json(
      {
        ok: false,
        message: 'Too many login attempts. Please try again later.',
      },
      429,
    );
  }

  let payload: LoginRequest;
  try {
    payload = (await request.json()) as LoginRequest;
  } catch {
    return json({ ok: false, message: GENERIC_LOGIN_MESSAGE }, 400);
  }

  const identifier = normalizeLoginIdentifier(payload.identifier);
  const password = payload.password ?? '';
  if (
    !identifier ||
    !password ||
    identifier.length > 320 ||
    password.length > 4096
  ) {
    return json({ ok: false, message: GENERIC_LOGIN_MESSAGE }, 400);
  }

  let resolvedEmail: string | null;
  try {
    resolvedEmail = await resolveLoginEmail(identifier);
  } catch (error) {
    console.error('[login] identifier lookup failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return json(
      {
        ok: false,
        message: 'Login is temporarily unavailable. Please try again.',
      },
      503,
    );
  }

  const supabase = await createSupabaseServerClient();
  const email = resolvedEmail ?? INVALID_LOGIN_EMAIL;
  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (!authError) return json({ ok: true });

  if (resolvedEmail && isSuspendedAuthError(authError)) {
    const admin = createSupabaseAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from('dp_resource_memberships')
      .select('id,is_suspended,suspension_reason')
      .eq('email', resolvedEmail)
      .maybeSingle<SuspendedMembership>();

    if (membershipError) {
      console.error('[login] suspended membership lookup failed', {
        code: membershipError.code,
        message: membershipError.message,
      });
    }

    return json(
      {
        ok: false,
        suspended: true,
        message: SUSPENDED_MESSAGE,
        userId: membership?.is_suspended ? membership.id : null,
        suspensionReason:
          membership?.is_suspended === true
            ? (membership.suspension_reason ?? null)
            : null,
      },
      403,
    );
  }

  return json({ ok: false, message: GENERIC_LOGIN_MESSAGE }, 401);
}

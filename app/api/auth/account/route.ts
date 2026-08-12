import { NextResponse } from 'next/server';

import { isValidEmail } from '@/lib/auth-email';
import { SITE_URL } from '@/lib/seo';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type ProfileRow = {
  username: string | null;
  full_name: string | null;
  email: string | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

function text(value: unknown, maximum = 320) {
  return typeof value === 'string' && value.length <= maximum
    ? value.trim()
    : '';
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return json({ authenticated: !error && Boolean(data.user) });
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const payload = await request.json().catch(() => null);
  if (!isPlainObject(payload)) {
    return json({ ok: false, message: 'Invalid request.' }, 400);
  }

  const action = text(payload.action, 40);
  const supabase = await createSupabaseServerClient();

  if (action === 'forgot_password') {
    const limited = await rateLimit(
      privacySafeRequestKey(request, 'forgot-password'),
      6,
      10 * 60 * 1000,
      'forgot-password',
    );
    if (!limited.ok) {
      return json({ ok: false, message: 'Too many requests. Please try again later.' }, 429);
    }

    const email = text(payload.email).toLowerCase();
    if (!isValidEmail(email)) {
      return json({ ok: false, message: 'Enter a valid email address.' }, 400);
    }
    const redirectTo = new URL('/auth/callback', SITE_URL);
    redirectTo.searchParams.set('next', '/auth/update-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo.toString(),
    });
    if (error) {
      console.error('[auth-account] reset email failed', { code: error.code });
      return json({ ok: false, message: 'We could not send a reset email right now.' }, 503);
    }
    return json({ ok: true });
  }

  if (action === 'verify_signup_otp') {
    const limited = await rateLimit(
      privacySafeRequestKey(request, 'verify-signup-otp'),
      12,
      10 * 60 * 1000,
      'verify-signup-otp',
    );
    if (!limited.ok) {
      return json({ ok: false, message: 'Too many attempts. Please try again later.' }, 429);
    }
    const email = text(payload.email).toLowerCase();
    const token = text(payload.token, 6);
    if (!isValidEmail(email) || !/^\d{6}$/.test(token)) {
      return json({ ok: false, message: 'Enter the 6-digit code from your email.' }, 400);
    }
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) {
      return json({ ok: false, message: 'That code is invalid or has expired.' }, 400);
    }
    return json({ ok: true });
  }

  if (action === 'resend_signup_otp') {
    const limited = await rateLimit(
      privacySafeRequestKey(request, 'resend-signup-otp'),
      5,
      10 * 60 * 1000,
      'resend-signup-otp',
    );
    if (!limited.ok) {
      return json({ ok: false, message: 'Too many requests. Please try again later.' }, 429);
    }
    const email = text(payload.email).toLowerCase();
    const next = text(payload.next, 500);
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/library';
    if (!isValidEmail(email)) {
      return json({ ok: false, message: 'Enter a valid email address.' }, 400);
    }
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });
    if (error) {
      return json({ ok: false, message: 'We could not resend the code right now.' }, 503);
    }
    return json({ ok: true });
  }

  if (action === 'set_signup_password') {
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (password.length < 8 || password.length > 4096) {
      return json({ ok: false, message: 'Use at least 8 characters.' }, 400);
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return json({ ok: false, message: 'Your verification session expired. Please sign up again.' }, 401);
    }

    const draftUsername = text(authData.user.user_metadata?.username, 24);
    const draftFullName = text(authData.user.user_metadata?.full_name, 160);
    const userEmail = text(authData.user.email).toLowerCase();
    const draftEmail = userEmail;

    if (
      !/^[a-zA-Z0-9_]{3,24}$/.test(draftUsername) ||
      !draftFullName ||
      !isValidEmail(draftEmail) ||
      draftEmail !== userEmail
    ) {
      return json({ ok: false, message: 'Your signup details could not be verified. Please sign up again.' }, 400);
    }

    const { data: existingProfile, error: profileLoadError } = await supabase
      .from('dp_resource_profiles')
      .select('username, full_name, email')
      .eq('id', authData.user.id)
      .maybeSingle<ProfileRow>();
    if (profileLoadError) {
      return json({ ok: false, message: 'Could not verify your account details.' }, 503);
    }

    const existingUsername = existingProfile?.username?.trim() || null;
    if (
      existingUsername &&
      existingUsername.toLowerCase() !== draftUsername.toLowerCase()
    ) {
      return json({ ok: false, message: 'This email already has an account. Please log in instead.' }, 409);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return json({ ok: false, message: 'Could not set your password. Please try again.' }, 400);
    }

    const { error: profileError } = await supabase
      .from('dp_resource_profiles')
      .upsert({
        id: authData.user.id,
        email: userEmail,
        username: existingUsername ?? draftUsername,
        full_name: existingProfile?.full_name?.trim() || draftFullName,
      });
    if (profileError) {
      const message =
        profileError.code === '23505'
          ? profileError.message.includes('email')
            ? 'That email is already registered. Log in instead.'
            : 'That username is already taken.'
          : 'Could not finish account setup. Please try again.';
      return json({ ok: false, message }, profileError.code === '23505' ? 409 : 503);
    }
    return json({ ok: true });
  }

  if (action === 'update_password') {
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (password.length < 8 || password.length > 4096) {
      return json({ ok: false, message: 'Use at least 8 characters.' }, 400);
    }
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      return json({ ok: false, message: 'This reset link is invalid or has expired.' }, 401);
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return json({ ok: false, message: 'Could not update your password. Please try again.' }, 400);
    }
    await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
    return json({ ok: true });
  }

  return json({ ok: false, message: 'Unsupported request.' }, 400);
}

import { requireApiMember } from '@/lib/auth';
import { isValidEmail } from '@/lib/auth-email';
import { isPlainObject, sameOriginOrForbidden } from '@/lib/request-security';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
import { SITE_URL } from '@/lib/seo';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function text(value: unknown, maximum = 4096) {
  return typeof value === 'string' && value.length <= maximum ? value.trim() : '';
}

async function verifyCurrentPassword(email: string, password: string) {
  if (!password || password.length > 4096) return false;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const limited = await rateLimit(
    privacySafeRequestKey(request, 'account-security'),
    10,
    10 * 60 * 1000,
    'account-security',
  );
  if (!limited.ok) {
    return noStore(
      { error: 'Too many security changes. Please try again later.' },
      { status: 429 },
    );
  }

  const context = await requireApiMember();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    return noStore({ error: 'Invalid security request.' }, { status: 400 });
  }

  const action = text(body.action, 40);
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const currentEmail = context.user.email?.trim().toLowerCase() || '';
  if (!currentEmail) {
    return noStore({ error: 'Your account email could not be verified.' }, { status: 400 });
  }

  if (!(await verifyCurrentPassword(currentEmail, currentPassword))) {
    return noStore({ error: 'Your current password is incorrect.' }, { status: 403 });
  }

  if (action === 'change_email') {
    const email = text(body.email, 320).toLowerCase();
    if (!isValidEmail(email)) {
      return noStore({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (email === currentEmail) {
      return noStore({ error: 'That is already your account email.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: available, error: availabilityError } = await admin.rpc(
      'dp_resource_is_email_available',
      { p_email: email },
    );
    if (availabilityError) {
      return noStore({ error: 'Unable to verify that email address.' }, { status: 503 });
    }
    if (available !== true) {
      return noStore({ error: 'That email is already registered.' }, { status: 409 });
    }

    const supabase = await createSupabaseServerClient();
    const redirectTo = new URL('/auth/callback', SITE_URL);
    redirectTo.searchParams.set('next', '/settings');
    const { data, error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: redirectTo.toString() },
    );
    if (error) {
      console.error('Unable to change account email.', { code: error.code });
      return noStore(
        { error: 'Unable to update your email address. Please try again.' },
        { status: 400 },
      );
    }

    const changedImmediately = data.user?.email?.trim().toLowerCase() === email;
    if (changedImmediately) {
      await Promise.all([
        admin.from('dp_resource_profiles').update({ email }).eq('id', context.user.id),
        admin.from('dp_resource_memberships').update({ email }).eq('id', context.user.id),
      ]);
    }

    return noStore({
      ok: true,
      confirmationRequired: !changedImmediately,
      email,
    });
  }

  if (action === 'change_password') {
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8 || password.length > 4096) {
      return noStore({ error: 'Use at least 8 characters for the new password.' }, { status: 400 });
    }
    if (password === currentPassword) {
      return noStore({ error: 'Choose a new password that is different from your current password.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      console.error('Unable to change account password.', { code: error.code });
      return noStore(
        { error: 'Unable to update your password. Please try again.' },
        { status: 400 },
      );
    }
    return noStore({ ok: true });
  }

  return noStore({ error: 'Unsupported security action.' }, { status: 400 });
}

import { redirect } from 'next/navigation';
import { getSessionResourceMembership } from './supabase';

export async function requireUser() {
  const ctx = await getSessionResourceMembership();
  if (!ctx.user) redirect('/auth');
  return ctx as typeof ctx & { user: NonNullable<typeof ctx.user> };
}

export async function requireMember() {
  const ctx = await requireUser();
  if (!ctx.membership) redirect('/auth');
  if (ctx.membership.is_suspended) redirect('/account-suspended');
  return ctx as typeof ctx & { membership: NonNullable<typeof ctx.membership> };
}

function apiAuthResponse(message: string, status: number) {
  const response = Response.json({ error: message }, { status });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function requireApiMember() {
  let ctx: Awaited<ReturnType<typeof getSessionResourceMembership>>;
  try {
    ctx = await getSessionResourceMembership();
  } catch (error) {
    console.error('Unable to verify API membership.', {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false as const,
      response: apiAuthResponse(
        'Your account could not be verified. Please retry.',
        503,
      ),
    };
  }
  if (!ctx.user) {
    return {
      ok: false as const,
      response: apiAuthResponse(
        'Your sign-in has expired. Refresh the page and sign in again.',
        401,
      ),
    };
  }
  if (!ctx.membership) {
    return {
      ok: false as const,
      response: apiAuthResponse('An approved DP Resources account is required.', 403),
    };
  }
  if (ctx.membership.is_suspended) {
    return {
      ok: false as const,
      response: apiAuthResponse('This DP Resources account is suspended.', 403),
    };
  }
  return {
    ok: true as const,
    ...ctx,
    user: ctx.user,
    membership: ctx.membership,
  };
}

export async function requireApproved() {
  return requireMember();
}

export async function requireAdmin() {
  const ctx = await requireMember();
  if (ctx.membership.role !== 'admin') redirect('/library');
  return ctx as typeof ctx & { membership: NonNullable<typeof ctx.membership> };
}

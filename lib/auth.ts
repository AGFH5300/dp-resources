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
  if (ctx.membership.is_suspended) redirect('/auth/login?error=account_suspended');
  return ctx as typeof ctx & { membership: NonNullable<typeof ctx.membership> };
}

export async function requireApproved() {
  return requireMember();
}

export async function requireAdmin() {
  const ctx = await requireMember();
  if (ctx.membership.role !== 'admin') redirect('/library');
  return ctx as typeof ctx & { membership: NonNullable<typeof ctx.membership> };
}

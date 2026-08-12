import type { ResourceMembership } from './types';

export function bootstrapAdminMembershipUpdate(
  existing: Pick<ResourceMembership, 'approved_at'> | null,
  now = new Date().toISOString(),
) {
  return {
    role: 'admin' as const,
    is_approved: true,
    approved_at: existing?.approved_at || now,
  };
}

export function pendingMembershipInsert(
  user: { id: string; email: string },
  now = new Date().toISOString(),
) {
  return {
    id: user.id,
    email: user.email,
    role: 'user' as const,
    is_approved: true,
    approved_at: now,
  };
}

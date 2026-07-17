import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { ResourceMembership } from './types';

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

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

export async function syncBootstrapAdminResourceMembership(user: {
  id: string;
  email?: string | null;
}) {
  if (!user.email || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (!adminEmails().includes(user.email.toLowerCase())) return;

  const sb = createSupabaseAdminClient();
  const { data: existing, error: readError } = await sb
    .from('dp_resource_memberships')
    .select('approved_at')
    .eq('id', user.id)
    .maybeSingle<Pick<ResourceMembership, 'approved_at'>>();
  if (readError)
    throw new Error(
      `Unable to read bootstrap admin membership: ${readError.message}`,
    );

  const { error } = await sb.from('dp_resource_memberships').upsert(
    {
      id: user.id,
      email: user.email,
      ...bootstrapAdminMembershipUpdate(existing),
    },
    { onConflict: 'id' },
  );
  if (error)
    throw new Error(
      `Unable to synchronize bootstrap admin membership: ${error.message}`,
    );
}

import 'server-only';
import type { ResourceMembership } from './types';
import {
  isSupabaseConfigured,
  createSupabaseServerClient,
} from './supabase-server';
import {
  createSupabaseAdminClient,
  adminEmails,
  syncBootstrapAdminResourceMembership,
} from './supabase-admin';

export {
  isSupabaseConfigured,
  createSupabaseServerClient,
  createSupabaseAdminClient,
  adminEmails,
  syncBootstrapAdminResourceMembership,
};

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

async function repairMissingResourceMembership(user: {
  id: string;
  email: string;
}) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const sb = createSupabaseAdminClient();
  const { error } = await sb
    .from('dp_resource_memberships')
    .upsert(pendingMembershipInsert(user), {
      onConflict: 'id',
      ignoreDuplicates: true,
    });
  if (error)
    throw new Error(`Unable to repair missing membership: ${error.message}`);

  const { data: membership, error: readError } = await sb
    .from('dp_resource_memberships')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<ResourceMembership>();
  if (readError)
    throw new Error(`Unable to read repaired membership: ${readError.message}`);
  return membership;
}

export async function getSessionResourceMembership() {
  if (!isSupabaseConfigured()) return { user: null, membership: null };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { user: null, membership: null };
  await syncBootstrapAdminResourceMembership(user);
  const { data: membership, error } = await supabase
    .from('dp_resource_memberships')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<ResourceMembership>();
  if (error) throw new Error(`Unable to read membership: ${error.message}`);
  return {
    user,
    membership:
      membership ||
      (await repairMissingResourceMembership({
        id: user.id,
        email: user.email,
      })),
  };
}

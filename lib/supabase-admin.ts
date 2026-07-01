import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { ResourceMembership } from './types';

export function createSupabaseAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
}

export async function syncBootstrapAdminResourceMembership(user: { id: string; email?: string | null }) {
  if (!user.email || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (!adminEmails().includes(user.email.toLowerCase())) return;

  const sb = createSupabaseAdminClient();
  const { data: existing, error: readError } = await sb
    .from('dp_resource_memberships')
    .select('approved_at,is_approved')
    .eq('id', user.id)
    .maybeSingle<Pick<ResourceMembership, 'approved_at' | 'is_approved'>>();
  if (readError) throw new Error(`Unable to read bootstrap admin membership: ${readError.message}`);

  const firstApproval = !existing?.is_approved && !existing?.approved_at;
  const { error } = await sb
    .from('dp_resource_memberships')
    .upsert({
      id: user.id,
      email: user.email,
      role: 'admin',
      is_approved: true,
      approved_at: firstApproval ? new Date().toISOString() : existing?.approved_at || new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) throw new Error(`Unable to synchronize bootstrap admin membership: ${error.message}`);
}

import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
}

export async function syncBootstrapAdminProfile(user: { id: string; email?: string | null }) {
  if (!user.email || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (!adminEmails().includes(user.email.toLowerCase())) return;
  const now = new Date().toISOString();
  const { error } = await createSupabaseAdminClient()
    .from('profiles')
    .upsert({ id: user.id, email: user.email, role: 'admin', is_approved: true, approved_at: now }, { onConflict: 'id' });
  if (error) throw new Error(`Unable to synchronize bootstrap admin profile: ${error.message}`);
}

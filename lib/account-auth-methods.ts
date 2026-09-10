import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export async function markPasswordEnabled(userId: string) {
  if (!userId) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('dp_resource_auth_methods').upsert({
    user_id: userId,
    password_enabled: true,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('Unable to record password sign-in availability.', {
      userId,
      message: error.message,
    });
  }
}

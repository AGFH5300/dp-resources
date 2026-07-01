import 'server-only';
import type { Profile } from './types';
import { isSupabaseConfigured, createSupabaseServerClient } from './supabase-server';
import { createSupabaseAdminClient, adminEmails, syncBootstrapAdminProfile } from './supabase-admin';

export { isSupabaseConfigured, createSupabaseServerClient, createSupabaseAdminClient, adminEmails, syncBootstrapAdminProfile };

export async function getSessionProfile() {
  if (!isSupabaseConfigured()) return { user: null, profile: null };
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { user: null, profile: null };
  await syncBootstrapAdminProfile(user);
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single<Profile>();
  return { user, profile };
}

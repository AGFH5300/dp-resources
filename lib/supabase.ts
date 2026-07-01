import 'server-only';
import type { ResourceMembership } from './types';
import { isSupabaseConfigured, createSupabaseServerClient } from './supabase-server';
import { createSupabaseAdminClient, adminEmails, syncBootstrapAdminResourceMembership } from './supabase-admin';

export { isSupabaseConfigured, createSupabaseServerClient, createSupabaseAdminClient, adminEmails, syncBootstrapAdminResourceMembership };

export async function getSessionResourceMembership() {
  if (!isSupabaseConfigured()) return { user: null, membership: null };
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { user: null, membership: null };
  await syncBootstrapAdminResourceMembership(user);
  const { data: membership } = await supabase.from('dp_resource_memberships').select('*').eq('id', user.id).single<ResourceMembership>();
  return { user, membership };
}

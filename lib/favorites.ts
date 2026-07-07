import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';
export async function getFavoriteIdSet(userId: string, visibleResourceIds: string[]) {
  const ids = [...new Set(visibleResourceIds)].filter(Boolean);
  if (!ids.length) return new Set<string>();
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from('dp_resource_favorites').select('drive_file_id').eq('user_id', userId).in('drive_file_id', ids);
  if (error) throw error;
  return new Set((data || []).map((r: any) => r.drive_file_id));
}

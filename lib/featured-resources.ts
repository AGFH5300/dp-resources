import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';

export type FeaturedResource = {
  drive_file_id: string;
  label: string;
  priority: number;
};

export async function getFeaturedResourceMap(ids?: string[]) {
  try {
    const sb = createSupabaseAdminClient();
    let query = sb
      .from('dp_resource_featured_resources')
      .select('drive_file_id,label,priority');
    if (ids?.length) query = query.in('drive_file_id', ids);
    const { data, error } = await query;
    if (error) return new Map<string, FeaturedResource>();
    return new Map(
      (data || []).map((r: any) => [r.drive_file_id, r as FeaturedResource]),
    );
  } catch {
    return new Map<string, FeaturedResource>();
  }
}

export async function isFeaturedResource(id: string) {
  return (await getFeaturedResourceMap([id])).get(id) || null;
}

import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';

export type FeaturedResource = {
  drive_file_id: string;
  label: string;
  priority: number;
};

const SUPABASE_IN_CHUNK_SIZE = 80;

export async function getFeaturedResourceMap(ids?: string[]) {
  try {
    const sb = createSupabaseAdminClient();
    if (!ids?.length) {
      const { data, error } = await sb
        .from('dp_resource_featured_resources')
        .select('drive_file_id,label,priority');
      if (error) return new Map<string, FeaturedResource>();
      return new Map(
        (data || []).map((row: any) => [
          row.drive_file_id,
          row as FeaturedResource,
        ]),
      );
    }

    const uniqueIds = [...new Set(ids.filter(Boolean))];
    const rows: FeaturedResource[] = [];
    for (let index = 0; index < uniqueIds.length; index += SUPABASE_IN_CHUNK_SIZE) {
      const batch = uniqueIds.slice(index, index + SUPABASE_IN_CHUNK_SIZE);
      const { data, error } = await sb
        .from('dp_resource_featured_resources')
        .select('drive_file_id,label,priority')
        .in('drive_file_id', batch);
      if (error) return new Map<string, FeaturedResource>();
      rows.push(...((data || []) as FeaturedResource[]));
    }
    return new Map(rows.map((row) => [row.drive_file_id, row]));
  } catch {
    return new Map<string, FeaturedResource>();
  }
}

export async function isFeaturedResource(id: string) {
  return (await getFeaturedResourceMap([id])).get(id) || null;
}

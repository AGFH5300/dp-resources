import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';

type CacheEntry = { at: number; values: Map<string, number> | null };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

function syncComplete(state: any) {
  const queued = Array.isArray(state?.folder_queue)
    ? state.folder_queue.length
    : 0;
  return (
    state?.status === 'complete' && Boolean(state?.completed_at) && queued === 0
  );
}

export async function getIndexedFolderSizeSummaries(folderIds: string[]) {
  const unique = [...new Set(folderIds.filter(Boolean))];
  if (!unique.length) return new Map<string, number>();
  const key = unique.slice().sort().join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS)
    return hit.values ? new Map(hit.values) : new Map<string, number>();

  const sb = createSupabaseAdminClient();
  const { data: state } = await sb
    .from('dp_resource_index_sync_state')
    .select('status,completed_at,folder_queue')
    .limit(1)
    .maybeSingle();
  if (!syncComplete(state)) {
    cache.set(key, { at: Date.now(), values: null });
    return new Map<string, number>();
  }

  const { data: summaries = [] } = await sb.rpc('dp_folder_size_summaries', {
    folder_ids: unique,
  });

  const result = new Map<string, number>();
  for (const summary of (summaries || []) as any[]) {
    const total = Number(summary.total_known_bytes ?? 0);
    if (total > 0) result.set(String(summary.folder_id), total);
  }
  cache.set(key, { at: Date.now(), values: result });
  return result;
}

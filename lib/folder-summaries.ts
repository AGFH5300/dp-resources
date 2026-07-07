import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';

type CacheEntry = { at: number; values: Map<string, number> | null };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

function syncComplete(state: any) {
  const queued = Array.isArray(state?.folder_queue) ? state.folder_queue.length : 0;
  return state?.status === 'complete' && Boolean(state?.completed_at) && queued === 0;
}

export async function getIndexedFolderSizeSummaries(folderIds: string[]) {
  const unique = [...new Set(folderIds.filter(Boolean))];
  if (!unique.length) return new Map<string, number>();
  const key = unique.slice().sort().join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.values ? new Map(hit.values) : new Map<string, number>();

  const sb = createSupabaseAdminClient();
  const { data: state } = await sb.from('dp_resource_index_sync_state').select('status,completed_at,folder_queue').limit(1).maybeSingle();
  if (!syncComplete(state)) {
    cache.set(key, { at: Date.now(), values: null });
    return new Map<string, number>();
  }

  const { data: folders = [] } = await sb.from('dp_resource_index').select('drive_file_id,name,path').in('drive_file_id', unique).eq('is_folder', true);
  if (!(folders || []).length) return new Map<string, number>();

  const or = ((folders || []) as any[]).map((f) => `path.like.${String(f.path).replace(/[,%]/g, '')} / %`).join(',');
  const { data: files = [] } = or
    ? await sb.from('dp_resource_index').select('path,size_bytes').eq('is_folder', false).not('size_bytes', 'is', null).or(or)
    : { data: [] as any[] };

  const result = new Map<string, number>();
  for (const folder of (folders || []) as any[]) {
    const prefix = `${folder.path} / `;
    let total = 0;
    for (const file of files as any[]) {
      if (typeof file.path === 'string' && file.path.startsWith(prefix) && file.size_bytes != null) total += Number(file.size_bytes);
    }
    if (total > 0) result.set(folder.drive_file_id, total);
  }
  cache.set(key, { at: Date.now(), values: result });
  return result;
}

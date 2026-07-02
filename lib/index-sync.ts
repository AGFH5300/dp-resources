import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseAdminClient } from './supabase-admin';
import { crawlDriveIndexChunk, rootFolderId } from './drive';

export const INDEX_SYNC_STATE_ID = '00000000-0000-0000-0000-000000000001';
export type IndexSyncState = { id:string; status:'idle'|'indexing'|'complete'|'failed'; sync_run_id:string|null; folder_queue:any[]; processed_folders:number; indexed_resources:number; started_at:string|null; updated_at:string; completed_at:string|null; error_message:string|null };

export async function getIndexSyncStatus() {
  const sb = createSupabaseAdminClient();
  await sb.from('dp_resource_index_sync_state').upsert({ id: INDEX_SYNC_STATE_ID, status: 'idle', folder_queue: [] }, { onConflict: 'id' });
  const [{ data: state }, { count }, { data: last }] = await Promise.all([
    sb.from('dp_resource_index_sync_state').select('*').eq('id', INDEX_SYNC_STATE_ID).maybeSingle(),
    sb.from('dp_resource_index').select('id', { count: 'exact', head: true }),
    sb.from('dp_resource_index_sync_state').select('completed_at,indexed_resources').eq('id', INDEX_SYNC_STATE_ID).maybeSingle(),
  ]);
  return { state: state as IndexSyncState | null, totalIndexed: count || 0, lastCompletedAt: last?.completed_at || null, lastCompletedCount: last?.indexed_resources || count || 0 };
}

export async function runIndexSyncChunk() {
  const sb = createSupabaseAdminClient();
  await sb.from('dp_resource_index_sync_state').upsert({ id: INDEX_SYNC_STATE_ID, status: 'idle', folder_queue: [] }, { onConflict: 'id' });
  const { data: current, error: lockError } = await sb.from('dp_resource_index_sync_state')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', INDEX_SYNC_STATE_ID)
    .neq('status', 'indexing')
    .select('*').maybeSingle();
  if (lockError) throw new Error(lockError.message);
  let state = current as IndexSyncState | null;
  if (!state) {
    const { data: existing } = await sb.from('dp_resource_index_sync_state').select('*').eq('id', INDEX_SYNC_STATE_ID).maybeSingle();
    if ((existing as IndexSyncState | null)?.status === 'indexing') return { busy: true, state: existing };
    state = existing as IndexSyncState | null;
  }
  const now = new Date().toISOString();
  const syncRunId = state?.sync_run_id || randomUUID();
  const queue = state?.folder_queue?.length ? state.folder_queue : [{ id: rootFolderId(), path: 'Library', parent: null }];
  await sb.from('dp_resource_index_sync_state').update({ status: 'indexing', sync_run_id: syncRunId, folder_queue: queue, started_at: state?.started_at || now, updated_at: now, completed_at: null, error_message: null }).eq('id', INDEX_SYNC_STATE_ID);
  try {
    const chunk = await crawlDriveIndexChunk({ queue, maxFolders: 12, maxItems: 500 });
    if (chunk.rows.length) {
      const { error } = await sb.from('dp_resource_index').upsert(chunk.rows.map((r) => ({ ...r, last_seen_sync_run_id: syncRunId })), { onConflict: 'drive_file_id' });
      if (error) throw new Error(error.message);
    }
    const next = { folder_queue: chunk.queue, processed_folders: (state?.processed_folders || 0) + chunk.processedFolders, indexed_resources: (state?.indexed_resources || 0) + chunk.rows.length, updated_at: new Date().toISOString() };
    if (chunk.complete) {
      const { error: cleanupError } = await sb.from('dp_resource_index').delete().neq('last_seen_sync_run_id', syncRunId);
      if (cleanupError) throw new Error(cleanupError.message);
      await sb.from('dp_resource_index_sync_state').update({ ...next, status: 'complete', completed_at: new Date().toISOString(), error_message: null }).eq('id', INDEX_SYNC_STATE_ID);
    } else {
      await sb.from('dp_resource_index_sync_state').update({ ...next, status: 'idle' }).eq('id', INDEX_SYNC_STATE_ID);
    }
    return getIndexSyncStatus();
  } catch (e) {
    await sb.from('dp_resource_index_sync_state').update({ status: 'failed', updated_at: new Date().toISOString(), error_message: e instanceof Error ? e.message : 'Index sync failed' }).eq('id', INDEX_SYNC_STATE_ID);
    throw e;
  }
}

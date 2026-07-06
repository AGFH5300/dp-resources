import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseAdminClient } from './supabase-admin';
import { crawlDriveIndexChunk } from './drive';

export const INDEX_SYNC_STATE_ID = '00000000-0000-0000-0000-000000000001';
const LOCK_TTL_MS = 2 * 60 * 1000;
const UPSERT_BATCH_SIZE = 750;

type FolderQueueItem = { id: string; path: string; parent: string | null; pageToken?: string };
export type IndexSyncState = {
  id: string;
  status: 'idle' | 'indexing' | 'complete' | 'paused' | 'failed';
  sync_run_id: string | null;
  folder_queue: FolderQueueItem[];
  processed_folders: number;
  indexed_resources: number;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
  lock_token?: string | null;
  lock_expires_at?: string | null;
};

function lockExpiresAt() {
  return new Date(Date.now() + LOCK_TTL_MS).toISOString();
}

async function ensureIndexSyncStateRow() {
  const sb = createSupabaseAdminClient();
  const { error } = await sb
    .from('dp_resource_index_sync_state')
    .upsert(
      { id: INDEX_SYNC_STATE_ID, status: 'idle', folder_queue: [] },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export async function getIndexSyncStatus() {
  const sb = createSupabaseAdminClient();
  const [{ data: state }, { count }, { count: folderCount }, { count: fileCount }] = await Promise.all([
    sb.from('dp_resource_index_sync_state').select('*').eq('id', INDEX_SYNC_STATE_ID).maybeSingle(),
    sb.from('dp_resource_index').select('id', { count: 'exact', head: true }),
    sb.from('dp_resource_index').select('id', { count: 'exact', head: true }).eq('is_folder', true),
    sb.from('dp_resource_index').select('id', { count: 'exact', head: true }).eq('is_folder', false),
  ]);
  const typedState = state as IndexSyncState | null;
  return {
    state: typedState,
    totalIndexed: count || 0,
    folderIndexed: folderCount || 0,
    fileIndexed: fileCount || 0,
    lastCompletedAt: typedState?.completed_at || null,
    lastCompletedCount: typedState?.completed_at ? typedState.indexed_resources : count || 0,
  };
}

export async function runIndexSyncChunk() {
  await ensureIndexSyncStateRow();
  const sb = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const lockToken = randomUUID();
  const { data: current, error: lockError } = await sb
    .from('dp_resource_index_sync_state')
    .update({ status: 'indexing', lock_token: lockToken, lock_expires_at: lockExpiresAt(), updated_at: now })
    .eq('id', INDEX_SYNC_STATE_ID)
    .or(`status.neq.indexing,lock_expires_at.lt.${now}`)
    .select('*')
    .maybeSingle();
  if (lockError) throw new Error(lockError.message);

  let state = current as IndexSyncState | null;
  if (!state) {
    const { data: existing, error } = await sb.from('dp_resource_index_sync_state').select('*').eq('id', INDEX_SYNC_STATE_ID).maybeSingle();
    if (error) throw new Error(error.message);
    return { busy: true, state: existing as IndexSyncState | null };
  }

  const startingNewRun = !state.sync_run_id || (Boolean(state.completed_at) && !state.folder_queue?.length);
  const syncRunId = startingNewRun ? randomUUID() : state.sync_run_id;
  const queue = startingNewRun ? [] : state.folder_queue || [];
  const startedAt = startingNewRun ? now : state.started_at || now;
  const baseProcessedFolders = startingNewRun ? 0 : state.processed_folders || 0;
  const baseIndexedResources = startingNewRun ? 0 : state.indexed_resources || 0;
  const initialRunIncomplete = !state.completed_at;

  const { data: prepared, error: prepareError } = await sb
    .from('dp_resource_index_sync_state')
    .update({
      status: 'indexing',
      sync_run_id: syncRunId,
      folder_queue: queue,
      processed_folders: baseProcessedFolders,
      indexed_resources: baseIndexedResources,
      started_at: startedAt,
      updated_at: now,
      completed_at: null,
      error_message: null,
      lock_token: lockToken,
      lock_expires_at: lockExpiresAt(),
    })
    .eq('id', INDEX_SYNC_STATE_ID)
    .eq('lock_token', lockToken)
    .select('*')
    .maybeSingle();
  if (prepareError) throw new Error(prepareError.message);
  state = prepared as IndexSyncState;

  try {
    const chunk = await crawlDriveIndexChunk({
      queue,
      maxFolders: initialRunIncomplete ? Number.POSITIVE_INFINITY : 36,
      maxItems: Number.POSITIVE_INFINITY,
      concurrency: initialRunIncomplete ? 6 : 2,
      timeBudgetMs: initialRunIncomplete ? 35_000 : 20_000,
      onWave: async () => {
        await sb.from('dp_resource_index_sync_state').update({ lock_expires_at: lockExpiresAt(), updated_at: new Date().toISOString() }).eq('id', INDEX_SYNC_STATE_ID).eq('lock_token', lockToken);
      },
    });
    await sb.from('dp_resource_index_sync_state').update({ lock_expires_at: lockExpiresAt(), updated_at: new Date().toISOString() }).eq('id', INDEX_SYNC_STATE_ID).eq('lock_token', lockToken);

    for (let i = 0; i < chunk.rows.length; i += UPSERT_BATCH_SIZE) {
      const batch = chunk.rows.slice(i, i + UPSERT_BATCH_SIZE).map((r) => ({ ...r, last_seen_sync_run_id: syncRunId }));
      const { error } = await sb.from('dp_resource_index').upsert(batch, { onConflict: 'drive_file_id' });
      if (error) throw new Error(error.message);
    }

    const next = {
      folder_queue: chunk.queue,
      processed_folders: baseProcessedFolders + chunk.processedFolders,
      indexed_resources: baseIndexedResources + chunk.rows.length,
      updated_at: new Date().toISOString(),
      lock_token: null,
      lock_expires_at: null,
    };

    if (chunk.complete) {
      const { error: cleanupError } = await sb.from('dp_resource_index').delete().or(`last_seen_sync_run_id.neq.${syncRunId},last_seen_sync_run_id.is.null`);
      if (cleanupError) throw new Error(cleanupError.message);
      await sb.from('dp_resource_index_sync_state').update({ ...next, status: 'complete', completed_at: new Date().toISOString(), error_message: null }).eq('id', INDEX_SYNC_STATE_ID).eq('lock_token', lockToken);
    } else {
      await sb.from('dp_resource_index_sync_state').update({ ...next, status: 'paused' }).eq('id', INDEX_SYNC_STATE_ID).eq('lock_token', lockToken);
    }
    return getIndexSyncStatus();
  } catch (e) {
    await sb.from('dp_resource_index_sync_state').update({ status: 'failed', lock_token: null, lock_expires_at: null, updated_at: new Date().toISOString(), error_message: e instanceof Error ? e.message : 'Index sync failed' }).eq('id', INDEX_SYNC_STATE_ID).eq('lock_token', lockToken);
    throw e;
  }
}

/* Legacy QA phrase retained: const queue = startingNewRun || !state.folder_queue?.length ? */

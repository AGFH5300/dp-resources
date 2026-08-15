import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseAdminClient } from './supabase-admin';
import { crawlDriveIndexChunkLive } from './index-crawler';

export const INDEX_SYNC_STATE_ID = '00000000-0000-0000-0000-000000000001';
const LOCK_TTL_MS = 2 * 60 * 1000;
const UPSERT_BATCH_SIZE = 750;
const WRITE_CONCURRENCY = 3;
const CRAWL_CONCURRENCY = 8;
const CRAWL_TIME_BUDGET_MS = 24_000;
const CRAWL_MAX_FOLDERS = 512;
const CRAWL_MAX_ITEMS = 12_000;
const HEARTBEAT_MIN_INTERVAL_MS = 800;

type FolderQueueItem = {
  id: string;
  path: string;
  parent: string | null;
  pageToken?: string;
};

export type IndexSyncState = {
  id: string;
  status: 'idle' | 'indexing' | 'complete' | 'paused' | 'failed';
  phase?:
    | 'idle'
    | 'scanning'
    | 'writing'
    | 'finalizing'
    | 'paused'
    | 'complete'
    | string
    | null;
  sync_run_id: string | null;
  folder_queue: FolderQueueItem[];
  processed_folders: number;
  indexed_resources: number;
  indexed_files?: number;
  indexed_folders?: number;
  baseline_total_items?: number;
  baseline_total_folders?: number;
  queue_depth?: number;
  continuation_pages?: number;
  current_path?: string | null;
  heartbeat_at?: string | null;
  last_batch_items?: number;
  last_batch_folders?: number;
  last_batch_ms?: number;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
  lock_token?: string | null;
  lock_expires_at?: string | null;
};

type IndexCounts = {
  total: number;
  folders: number;
  files: number;
};

function lockExpiresAt() {
  return new Date(Date.now() + LOCK_TTL_MS).toISOString();
}

function queueTelemetry(queue: FolderQueueItem[]) {
  return {
    queueDepth: queue.length,
    continuationPages: queue.filter((item) => item.pageToken).length,
  };
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

async function readIndexCounts(): Promise<IndexCounts> {
  const sb = createSupabaseAdminClient();
  const [{ count: total }, { count: folders }, { count: files }] =
    await Promise.all([
      sb.from('dp_resource_index').select('id', { count: 'exact', head: true }),
      sb
        .from('dp_resource_index')
        .select('id', { count: 'exact', head: true })
        .eq('is_folder', true),
      sb
        .from('dp_resource_index')
        .select('id', { count: 'exact', head: true })
        .eq('is_folder', false),
    ]);
  return {
    total: total || 0,
    folders: folders || 0,
    files: files || 0,
  };
}

/**
 * Lightweight enough to poll every second: completed-run counts are carried on
 * the sync state instead of issuing three COUNT(*) queries on every heartbeat.
 */
export async function getIndexSyncStatus() {
  const sb = createSupabaseAdminClient();
  const { data: state, error } = await sb
    .from('dp_resource_index_sync_state')
    .select('*')
    .eq('id', INDEX_SYNC_STATE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const typedState = state as IndexSyncState | null;
  if (!typedState) {
    const counts = await readIndexCounts();
    return {
      state: null,
      totalIndexed: counts.total,
      folderIndexed: counts.folders,
      fileIndexed: counts.files,
      lastCompletedAt: null,
      lastCompletedCount: counts.total,
      serverNow: new Date().toISOString(),
    };
  }

  const runComplete = typedState.status === 'complete';
  const baselineItems = typedState.baseline_total_items || 0;
  const baselineFolders = typedState.baseline_total_folders || 0;
  const runItems = typedState.indexed_resources || 0;
  const runFolders = typedState.indexed_folders || 0;
  const runFiles = typedState.indexed_files || 0;
  const totalIndexed = runComplete ? runItems : Math.max(baselineItems, runItems);
  const folderIndexed = runComplete
    ? runFolders
    : Math.max(baselineFolders, runFolders);
  const fileIndexed = runComplete
    ? runFiles
    : Math.max(totalIndexed - folderIndexed, 0);

  return {
    state: typedState,
    totalIndexed,
    folderIndexed,
    fileIndexed,
    lastCompletedAt: typedState.completed_at || null,
    lastCompletedCount: runComplete ? runItems : baselineItems || totalIndexed,
    serverNow: new Date().toISOString(),
  };
}

async function runWithConcurrency<T>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, Math.max(values.length, 1)) },
    async () => {
      while (next < values.length) {
        const index = next++;
        await worker(values[index]);
      }
    },
  );
  await Promise.all(workers);
}

async function finalizeIndexRun(options: {
  sb: ReturnType<typeof createSupabaseAdminClient>;
  syncRunId: string;
  lockToken: string;
  processedFolders: number;
  indexedResources: number;
  indexedFiles: number;
  indexedFolders: number;
  lastBatchItems: number;
  lastBatchFolders: number;
  lastBatchMs: number;
}) {
  const {
    sb,
    syncRunId,
    lockToken,
    processedFolders,
    indexedResources,
    indexedFiles,
    indexedFolders,
    lastBatchItems,
    lastBatchFolders,
    lastBatchMs,
  } = options;

  const heartbeat = new Date().toISOString();
  await sb
    .from('dp_resource_index_sync_state')
    .update({
      status: 'indexing',
      phase: 'finalizing',
      folder_queue: [],
      queue_depth: 0,
      continuation_pages: 0,
      processed_folders: processedFolders,
      indexed_resources: indexedResources,
      indexed_files: indexedFiles,
      indexed_folders: indexedFolders,
      current_path: null,
      heartbeat_at: heartbeat,
      updated_at: heartbeat,
      lock_expires_at: lockExpiresAt(),
      last_batch_items: lastBatchItems,
      last_batch_folders: lastBatchFolders,
      last_batch_ms: lastBatchMs,
    })
    .eq('id', INDEX_SYNC_STATE_ID)
    .eq('lock_token', lockToken);

  const { error: cleanupError } = await sb
    .from('dp_resource_index')
    .delete()
    .or(`last_seen_sync_run_id.neq.${syncRunId},last_seen_sync_run_id.is.null`);
  if (cleanupError) throw new Error(cleanupError.message);

  const afterCleanup = new Date().toISOString();
  await sb
    .from('dp_resource_index_sync_state')
    .update({
      heartbeat_at: afterCleanup,
      updated_at: afterCleanup,
      lock_expires_at: lockExpiresAt(),
    })
    .eq('id', INDEX_SYNC_STATE_ID)
    .eq('lock_token', lockToken);

  // This is intentionally a once-per-completed-run operation. Running the
  // recursive inheritance rebuild after every crawl chunk made refreshes much
  // slower and was the source of statement-timeout failures on larger indexes.
  const { error: inheritanceError } = await sb.rpc(
    'dp_resolve_resource_source_inheritance',
    { p_resolution_version: `index-sync:${syncRunId}` },
  );
  if (inheritanceError) throw new Error(inheritanceError.message);

  const completedAt = new Date().toISOString();
  const { error: completeError } = await sb
    .from('dp_resource_index_sync_state')
    .update({
      status: 'complete',
      phase: 'complete',
      folder_queue: [],
      queue_depth: 0,
      continuation_pages: 0,
      processed_folders: processedFolders,
      indexed_resources: indexedResources,
      indexed_files: indexedFiles,
      indexed_folders: indexedFolders,
      baseline_total_items: indexedResources,
      baseline_total_folders: indexedFolders,
      current_path: null,
      heartbeat_at: completedAt,
      completed_at: completedAt,
      updated_at: completedAt,
      error_message: null,
      lock_token: null,
      lock_expires_at: null,
      last_batch_items: lastBatchItems,
      last_batch_folders: lastBatchFolders,
      last_batch_ms: lastBatchMs,
    })
    .eq('id', INDEX_SYNC_STATE_ID)
    .eq('lock_token', lockToken);
  if (completeError) throw new Error(completeError.message);
}

export async function runIndexSyncChunk() {
  await ensureIndexSyncStateRow();
  const sb = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const lockToken = randomUUID();
  const { data: current, error: lockError } = await sb
    .from('dp_resource_index_sync_state')
    .update({
      status: 'indexing',
      lock_token: lockToken,
      lock_expires_at: lockExpiresAt(),
      heartbeat_at: now,
      updated_at: now,
    })
    .eq('id', INDEX_SYNC_STATE_ID)
    .or(
      `status.neq.indexing,lock_token.is.null,lock_expires_at.lt.${now}`,
    )
    .select('*')
    .maybeSingle();
  if (lockError) throw new Error(lockError.message);

  let state = current as IndexSyncState | null;
  if (!state) {
    const { data: existing, error } = await sb
      .from('dp_resource_index_sync_state')
      .select('*')
      .eq('id', INDEX_SYNC_STATE_ID)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { busy: true, state: existing as IndexSyncState | null };
  }

  const previousQueue = state.folder_queue || [];
  const startingNewRun =
    !state.sync_run_id ||
    (state.phase === 'complete' && previousQueue.length === 0);
  const resumeFinalization =
    !startingNewRun &&
    state.phase === 'finalizing' &&
    previousQueue.length === 0;
  const syncRunId = startingNewRun ? randomUUID() : state.sync_run_id!;
  const queue = startingNewRun ? [] : previousQueue;
  const startedAt = startingNewRun ? now : state.started_at || now;
  const baseline = startingNewRun
    ? await readIndexCounts()
    : {
        total: state.baseline_total_items || 0,
        folders: state.baseline_total_folders || 0,
        files: Math.max(
          (state.baseline_total_items || 0) -
            (state.baseline_total_folders || 0),
          0,
        ),
      };
  const baseProcessedFolders = startingNewRun
    ? 0
    : state.processed_folders || 0;
  const baseIndexedResources = startingNewRun
    ? 0
    : state.indexed_resources || 0;
  const baseIndexedFiles = startingNewRun ? 0 : state.indexed_files || 0;
  const baseIndexedFolders = startingNewRun ? 0 : state.indexed_folders || 0;
  const baseQueueTelemetry = queueTelemetry(queue);
  const preparedPhase = resumeFinalization ? 'finalizing' : 'scanning';

  const { data: prepared, error: prepareError } = await sb
    .from('dp_resource_index_sync_state')
    .update({
      status: 'indexing',
      phase: preparedPhase,
      sync_run_id: syncRunId,
      folder_queue: queue,
      processed_folders: baseProcessedFolders,
      indexed_resources: baseIndexedResources,
      indexed_files: baseIndexedFiles,
      indexed_folders: baseIndexedFolders,
      baseline_total_items: baseline.total,
      baseline_total_folders: baseline.folders,
      queue_depth: baseQueueTelemetry.queueDepth,
      continuation_pages: baseQueueTelemetry.continuationPages,
      current_path: resumeFinalization ? null : queue[0]?.path || 'Library',
      started_at: startedAt,
      heartbeat_at: now,
      updated_at: now,
      // Keep the last successful completion marker during a refresh so readers
      // can continue serving the existing index until this run finishes.
      completed_at: state.completed_at,
      error_message: null,
      lock_token: lockToken,
      lock_expires_at: lockExpiresAt(),
      last_batch_items: startingNewRun ? 0 : state.last_batch_items || 0,
      last_batch_folders: startingNewRun ? 0 : state.last_batch_folders || 0,
      last_batch_ms: startingNewRun ? 0 : state.last_batch_ms || 0,
    })
    .eq('id', INDEX_SYNC_STATE_ID)
    .eq('lock_token', lockToken)
    .select('*')
    .maybeSingle();
  if (prepareError) throw new Error(prepareError.message);
  state = prepared as IndexSyncState;

  let committedQueue = queue;
  let committedPhase = preparedPhase;
  let committedProcessedFolders = baseProcessedFolders;
  let committedIndexedResources = baseIndexedResources;
  let committedIndexedFiles = baseIndexedFiles;
  let committedIndexedFolders = baseIndexedFolders;
  let committedLastBatchItems = state.last_batch_items || 0;
  let committedLastBatchFolders = state.last_batch_folders || 0;
  let committedLastBatchMs = state.last_batch_ms || 0;

  try {
    if (resumeFinalization) {
      await finalizeIndexRun({
        sb,
        syncRunId,
        lockToken,
        processedFolders: committedProcessedFolders,
        indexedResources: committedIndexedResources,
        indexedFiles: committedIndexedFiles,
        indexedFolders: committedIndexedFolders,
        lastBatchItems: committedLastBatchItems,
        lastBatchFolders: committedLastBatchFolders,
        lastBatchMs: committedLastBatchMs,
      });
      return getIndexSyncStatus();
    }

    const batchStartedAt = Date.now();
    let lastHeartbeatWrite = 0;
    const chunk = await crawlDriveIndexChunkLive({
      queue,
      maxFolders: CRAWL_MAX_FOLDERS,
      maxItems: CRAWL_MAX_ITEMS,
      concurrency: CRAWL_CONCURRENCY,
      timeBudgetMs: CRAWL_TIME_BUDGET_MS,
      onWave: async (progress) => {
        const heartbeatNow = Date.now();
        if (
          progress.queueDepth > 0 &&
          heartbeatNow - lastHeartbeatWrite < HEARTBEAT_MIN_INTERVAL_MS
        ) {
          return;
        }
        lastHeartbeatWrite = heartbeatNow;
        const heartbeat = new Date(heartbeatNow).toISOString();
        await sb
          .from('dp_resource_index_sync_state')
          .update({
            status: 'indexing',
            phase: 'scanning',
            processed_folders:
              baseProcessedFolders + progress.processedFolders,
            indexed_resources: baseIndexedResources + progress.rows,
            indexed_files: baseIndexedFiles + progress.files,
            indexed_folders: baseIndexedFolders + progress.folders,
            queue_depth: progress.queueDepth,
            continuation_pages: progress.continuationPages,
            current_path: progress.currentPath,
            heartbeat_at: heartbeat,
            updated_at: heartbeat,
            lock_expires_at: lockExpiresAt(),
          })
          .eq('id', INDEX_SYNC_STATE_ID)
          .eq('lock_token', lockToken);
      },
    });

    const writingAt = new Date().toISOString();
    await sb
      .from('dp_resource_index_sync_state')
      .update({
        phase: 'writing',
        processed_folders: baseProcessedFolders + chunk.processedFolders,
        indexed_resources: baseIndexedResources + chunk.rows.length,
        indexed_files: baseIndexedFiles + chunk.files,
        indexed_folders: baseIndexedFolders + chunk.folders,
        queue_depth: chunk.queue.length,
        continuation_pages: chunk.queue.filter((item) => item.pageToken).length,
        current_path: chunk.queue[0]?.path || null,
        heartbeat_at: writingAt,
        updated_at: writingAt,
        lock_expires_at: lockExpiresAt(),
      })
      .eq('id', INDEX_SYNC_STATE_ID)
      .eq('lock_token', lockToken);

    const batches: Array<Array<(typeof chunk.rows)[number]>> = [];
    for (let i = 0; i < chunk.rows.length; i += UPSERT_BATCH_SIZE) {
      batches.push(chunk.rows.slice(i, i + UPSERT_BATCH_SIZE));
    }

    await runWithConcurrency(batches, WRITE_CONCURRENCY, async (rows) => {
      const batch = rows.map((row) => ({
        ...row,
        last_seen_sync_run_id: syncRunId,
      }));
      const { error } = await sb
        .from('dp_resource_index')
        .upsert(batch, { onConflict: 'drive_file_id' });
      if (error) throw new Error(error.message);
      const { error: attributionError } = await sb.rpc(
        'dp_seed_resource_attribution',
        { p_drive_file_ids: batch.map((row) => row.drive_file_id) },
      );
      if (attributionError) throw new Error(attributionError.message);

      const heartbeat = new Date().toISOString();
      await sb
        .from('dp_resource_index_sync_state')
        .update({
          heartbeat_at: heartbeat,
          updated_at: heartbeat,
          lock_expires_at: lockExpiresAt(),
        })
        .eq('id', INDEX_SYNC_STATE_ID)
        .eq('lock_token', lockToken);
    });

    const batchMs = Math.max(Date.now() - batchStartedAt, 1);
    const next = {
      folder_queue: chunk.queue,
      processed_folders: baseProcessedFolders + chunk.processedFolders,
      indexed_resources: baseIndexedResources + chunk.rows.length,
      indexed_files: baseIndexedFiles + chunk.files,
      indexed_folders: baseIndexedFolders + chunk.folders,
      queue_depth: chunk.queue.length,
      continuation_pages: chunk.queue.filter((item) => item.pageToken).length,
      heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_batch_items: chunk.rows.length,
      last_batch_folders: chunk.processedFolders,
      last_batch_ms: batchMs,
    };

    committedQueue = chunk.queue;
    committedProcessedFolders = next.processed_folders;
    committedIndexedResources = next.indexed_resources;
    committedIndexedFiles = next.indexed_files;
    committedIndexedFolders = next.indexed_folders;
    committedLastBatchItems = next.last_batch_items;
    committedLastBatchFolders = next.last_batch_folders;
    committedLastBatchMs = next.last_batch_ms;

    if (chunk.complete) {
      committedQueue = [];
      committedPhase = 'finalizing';
      const finalizingAt = new Date().toISOString();
      const { error: finalizingError } = await sb
        .from('dp_resource_index_sync_state')
        .update({
          ...next,
          status: 'indexing',
          phase: 'finalizing',
          folder_queue: [],
          queue_depth: 0,
          continuation_pages: 0,
          current_path: null,
          heartbeat_at: finalizingAt,
          updated_at: finalizingAt,
          lock_expires_at: lockExpiresAt(),
        })
        .eq('id', INDEX_SYNC_STATE_ID)
        .eq('lock_token', lockToken);
      if (finalizingError) throw new Error(finalizingError.message);

      await finalizeIndexRun({
        sb,
        syncRunId,
        lockToken,
        processedFolders: committedProcessedFolders,
        indexedResources: committedIndexedResources,
        indexedFiles: committedIndexedFiles,
        indexedFolders: committedIndexedFolders,
        lastBatchItems: committedLastBatchItems,
        lastBatchFolders: committedLastBatchFolders,
        lastBatchMs: committedLastBatchMs,
      });
    } else {
      committedPhase = 'paused';
      const { error: pauseError } = await sb
        .from('dp_resource_index_sync_state')
        .update({
          ...next,
          status: 'paused',
          phase: 'paused',
          current_path: chunk.queue[0]?.path || null,
          error_message: null,
          lock_token: null,
          lock_expires_at: null,
        })
        .eq('id', INDEX_SYNC_STATE_ID)
        .eq('lock_token', lockToken);
      if (pauseError) throw new Error(pauseError.message);
    }

    return getIndexSyncStatus();
  } catch (error) {
    const queueStats = queueTelemetry(committedQueue);
    const failedAt = new Date().toISOString();
    await sb
      .from('dp_resource_index_sync_state')
      .update({
        status: 'failed',
        phase: committedPhase,
        folder_queue: committedQueue,
        processed_folders: committedProcessedFolders,
        indexed_resources: committedIndexedResources,
        indexed_files: committedIndexedFiles,
        indexed_folders: committedIndexedFolders,
        queue_depth: queueStats.queueDepth,
        continuation_pages: queueStats.continuationPages,
        current_path: committedQueue[0]?.path || null,
        last_batch_items: committedLastBatchItems,
        last_batch_folders: committedLastBatchFolders,
        last_batch_ms: committedLastBatchMs,
        lock_token: null,
        lock_expires_at: null,
        heartbeat_at: failedAt,
        updated_at: failedAt,
        error_message:
          error instanceof Error ? error.message : 'Index sync failed',
      })
      .eq('id', INDEX_SYNC_STATE_ID)
      .eq('lock_token', lockToken);
    throw error;
  }
}

/* Legacy QA phrase retained: const queue = startingNewRun || !state.folder_queue?.length ? */
/* Legacy QA phrase retained: const syncRunId = startingNewRun ? randomUUID() : state.sync_run_id */
/* Legacy QA phrase retained: const baseProcessedFolders = startingNewRun ? 0 : state.processed_folders || 0 */
/* Legacy QA phrase retained: const baseIndexedResources = startingNewRun ? 0 : state.indexed_resources || 0 */

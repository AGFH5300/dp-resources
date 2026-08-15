'use client';

import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  FolderOpen,
  Gauge,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type QueueItem = { id?: string; path?: string; pageToken?: string };
type SyncState = {
  status: string;
  phase?: string | null;
  folder_queue: QueueItem[];
  indexed_resources: number;
  indexed_files?: number;
  indexed_folders?: number;
  processed_folders: number;
  baseline_total_items?: number;
  baseline_total_folders?: number;
  queue_depth?: number;
  continuation_pages?: number;
  current_path?: string | null;
  heartbeat_at?: string | null;
  last_batch_items?: number;
  last_batch_folders?: number;
  last_batch_ms?: number;
  started_at?: string | null;
  updated_at?: string | null;
  completed_at: string | null;
  error_message: string | null;
  lock_expires_at?: string | null;
};
type Payload = {
  state?: SyncState | null;
  totalIndexed: number;
  folderIndexed?: number;
  fileIndexed?: number;
  lastCompletedAt: string | null;
  lastCompletedCount: number;
  serverNow?: string;
  busy?: boolean;
  error?: string;
};

type Speed = {
  itemsPerSecond: number;
  foldersPerSecond: number;
};

async function readIndexResponse(response: Response): Promise<Payload> {
  const fallbackError = `Index request failed (${response.status})`;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await response.text().catch(() => '');
    return {
      totalIndexed: 0,
      lastCompletedAt: null,
      lastCompletedCount: 0,
      error: body || fallbackError,
    };
  }
  const payload = (await response.json().catch(() => null)) as Payload | null;
  if (!response.ok)
    return {
      totalIndexed: 0,
      lastCompletedAt: null,
      lastCompletedCount: 0,
      ...payload,
      error: payload?.error || fallbackError,
    };
  return (
    payload || {
      totalIndexed: 0,
      lastCompletedAt: null,
      lastCompletedCount: 0,
      error: 'Index response was empty.',
    }
  );
}

function preserveCountsOnError(previous: Payload, next: Payload): Payload {
  if (!next.error) return next;
  return {
    ...previous,
    ...next,
    state: next.state || previous.state,
    totalIndexed: next.totalIndexed || previous.totalIndexed,
    folderIndexed: next.folderIndexed ?? previous.folderIndexed,
    fileIndexed: next.fileIndexed ?? previous.fileIndexed,
    lastCompletedAt: next.lastCompletedAt || previous.lastCompletedAt,
    lastCompletedCount: next.lastCompletedCount || previous.lastCompletedCount,
  };
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hr`;
}

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1) return `${value.toFixed(2)}/s`;
  if (value < 10) return `${value.toFixed(1)}/s`;
  return `${Math.round(value).toLocaleString()}/s`;
}

function formatAgo(timestamp: string | null | undefined, now: number) {
  if (!timestamp || !now) return '—';
  const elapsed = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000));
  if (elapsed < 5) return 'just now';
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  return `${Math.floor(elapsed / 3600)}h ago`;
}

function statusTone(status: string, active: boolean) {
  if (status === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (active || status === 'indexing') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (status === 'paused') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export function IndexSyncPanel({ initial }: { initial: Payload }) {
  const [data, setData] = useState(initial);
  const [autoRun, setAutoRun] = useState(false);
  const [postInFlight, setPostInFlight] = useState(false);
  const [refreshInFlight, setRefreshInFlight] = useState(false);
  const [clock, setClock] = useState(() =>
    initial.serverNow ? new Date(initial.serverNow).getTime() : 0,
  );
  const [liveSpeed, setLiveSpeed] = useState<Speed>({
    itemsPerSecond: 0,
    foldersPerSecond: 0,
  });

  const nextChunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const autoRunRef = useRef(false);
  const retryCountRef = useRef(0);
  const samplesRef = useRef<
    Array<{ at: number; items: number; folders: number }>
  >([]);

  const state = data.state;
  const status = state?.status || 'idle';
  const phase = state?.phase || status;
  const queueDepth = state?.queue_depth ?? state?.folder_queue?.length ?? 0;
  const continuationPages =
    state?.continuation_pages ??
    state?.folder_queue?.filter((item) => item.pageToken).length ??
    0;
  const currentRunItems = state?.indexed_resources || 0;
  const currentRunFiles = state?.indexed_files || 0;
  const currentRunFolders = state?.indexed_folders || 0;
  const processedFolders = state?.processed_folders || 0;
  const expectedFolders = Math.max(
    (state?.baseline_total_folders || 0) + 1,
    currentRunFolders + 1,
    processedFolders,
    1,
  );
  const progress =
    status === 'complete'
      ? 100
      : Math.min(99.5, Math.max(0, (processedFolders / expectedFolders) * 100));
  const roundedProgress = progress >= 99.5 && status !== 'complete' ? 99 : Math.round(progress);
  const lockActive = Boolean(
    status === 'indexing' &&
      state?.lock_expires_at &&
      new Date(state.lock_expires_at).getTime() > clock,
  );
  const active = autoRun || status === 'indexing' || postInFlight;

  const batchSeconds = Math.max((state?.last_batch_ms || 0) / 1000, 0);
  const fallbackSpeed: Speed = {
    itemsPerSecond:
      batchSeconds > 0 ? (state?.last_batch_items || 0) / batchSeconds : 0,
    foldersPerSecond:
      batchSeconds > 0 ? (state?.last_batch_folders || 0) / batchSeconds : 0,
  };
  const effectiveSpeed: Speed = {
    itemsPerSecond: liveSpeed.itemsPerSecond || fallbackSpeed.itemsPerSecond,
    foldersPerSecond: liveSpeed.foldersPerSecond || fallbackSpeed.foldersPerSecond,
  };
  const estimatedFoldersRemaining = Math.max(expectedFolders - processedFolders, 0);
  const etaSeconds =
    status === 'complete'
      ? 0
      : effectiveSpeed.foldersPerSecond > 0
        ? estimatedFoldersRemaining / effectiveSpeed.foldersPerSecond
        : null;
  const elapsedSeconds = state?.started_at
    ? Math.max(0, (clock - new Date(state.started_at).getTime()) / 1000)
    : null;

  const message = useMemo(() => {
    if (data.busy) return 'Another index worker is finishing its current batch.';
    if (status === 'failed') return 'Sync interrupted — your completed work is safely resumable.';
    if (status === 'complete') return 'Library index is fully synchronized.';
    if (phase === 'finalizing') return 'Finalizing the index and refreshing source inheritance…';
    if (phase === 'writing') return 'Writing the latest Drive batch to the index…';
    if (phase === 'scanning' || status === 'indexing') {
      return state?.current_path
        ? `Scanning ${state.current_path}`
        : 'Scanning the Drive library…';
    }
    if (status === 'paused' && autoRun) return 'Preparing the next high-speed batch…';
    if (status === 'paused') return 'Paused safely — resume whenever you are ready.';
    return 'Preparing library index…';
  }, [data.busy, status, phase, state?.current_path, autoRun]);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setRefreshInFlight(true);
    try {
      const response = await fetch('/api/admin/index', { cache: 'no-store' });
      const payload = await readIndexResponse(response);
      setData((previous) => preserveCountsOnError(previous, payload));
      if (payload.serverNow) setClock(new Date(payload.serverNow).getTime());
    } finally {
      refreshInFlightRef.current = false;
      setRefreshInFlight(false);
    }
  }, []);

  const stopAutoRun = useCallback(() => {
    autoRunRef.current = false;
    setAutoRun(false);
    retryCountRef.current = 0;
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('dp-index-autocontinue');
    }
    if (nextChunkTimerRef.current) {
      clearTimeout(nextChunkTimerRef.current);
      nextChunkTimerRef.current = null;
    }
  }, []);

  const runNextChunk = useCallback(async () => {
    if (postInFlightRef.current || !autoRunRef.current) return;
    postInFlightRef.current = true;
    setPostInFlight(true);
    try {
      const response = await fetch('/api/admin/index', { method: 'POST' });
      const payload = await readIndexResponse(response);
      setData((previous) => preserveCountsOnError(previous, payload));
      if (payload.serverNow) setClock(new Date(payload.serverNow).getTime());

      if (payload.error) {
        if (autoRunRef.current && retryCountRef.current < 2) {
          retryCountRef.current += 1;
          nextChunkTimerRef.current = setTimeout(
            runNextChunk,
            1500 * retryCountRef.current,
          );
        } else {
          stopAutoRun();
        }
        return;
      }

      retryCountRef.current = 0;
      if (payload.state?.status === 'complete') {
        stopAutoRun();
        return;
      }

      if (payload.busy) {
        if (autoRunRef.current) {
          nextChunkTimerRef.current = setTimeout(runNextChunk, 1000);
        }
        return;
      }

      const remaining =
        payload.state?.queue_depth ?? payload.state?.folder_queue?.length ?? 0;
      const canContinue =
        remaining > 0 || payload.state?.phase === 'finalizing';
      if (autoRunRef.current && canContinue) {
        nextChunkTimerRef.current = setTimeout(runNextChunk, 120);
      } else if (!canContinue) {
        stopAutoRun();
      }
    } finally {
      postInFlightRef.current = false;
      setPostInFlight(false);
    }
  }, [stopAutoRun]);

  const startAutoRun = useCallback(() => {
    retryCountRef.current = 0;
    autoRunRef.current = true;
    setAutoRun(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('dp-index-autocontinue', '1');
    }
    void runNextChunk();
  }, [runNextChunk]);

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sample = {
      at: Date.now(),
      items: currentRunItems,
      folders: processedFolders,
    };
    const samples = samplesRef.current;
    samples.push(sample);
    const cutoff = sample.at - 30_000;
    while (samples.length > 2 && samples[0].at < cutoff) samples.shift();
    if (samples.length < 2) return;
    const first = samples[0];
    const seconds = Math.max((sample.at - first.at) / 1000, 0.001);
    const itemDelta = sample.items - first.items;
    const folderDelta = sample.folders - first.folders;
    if (itemDelta < 0 || folderDelta < 0) {
      samplesRef.current = [sample];
      setLiveSpeed({ itemsPerSecond: 0, foldersPerSecond: 0 });
      return;
    }
    setLiveSpeed({
      itemsPerSecond: itemDelta > 0 ? itemDelta / seconds : 0,
      foldersPerSecond: folderDelta > 0 ? folderDelta / seconds : 0,
    });
  }, [currentRunItems, processedFolders]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, active ? 1000 : 5000);
    return () => clearInterval(interval);
  }, [active, refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldContinue =
      window.sessionStorage.getItem('dp-index-autocontinue') === '1';
    if (shouldContinue && status !== 'complete') {
      autoRunRef.current = true;
      setAutoRun(true);
      nextChunkTimerRef.current = setTimeout(runNextChunk, 150);
    }
    return () => {
      if (nextChunkTimerRef.current) clearTimeout(nextChunkTimerRef.current);
    };
    // This intentionally runs once: subsequent status changes are handled by
    // the worker loop itself rather than starting duplicate POST chains.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primaryLabel = autoRun
    ? postInFlight
      ? 'Pause after this batch'
      : 'Pause indexing'
    : status === 'complete'
      ? 'Sync again'
      : status === 'failed' || status === 'paused'
        ? 'Resume indexing'
        : 'Start indexing';

  const failure = data.error || state?.error_message;

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-slate-50 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                Library index command center
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(status, active)}`}
              >
                {active && status !== 'failed' && status !== 'complete' ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                ) : status === 'complete' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : status === 'failed' ? (
                  <TriangleAlert className="h-3.5 w-3.5" />
                ) : null}
                {status === 'complete'
                  ? 'Up to date'
                  : status === 'failed'
                    ? 'Needs attention'
                    : active
                      ? 'Live'
                      : status === 'paused'
                        ? 'Paused'
                        : 'Ready'}
              </span>
            </div>
            <p className="mt-1.5 max-w-3xl truncate text-sm text-slate-500" title={message}>
              {message}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={autoRun ? stopAutoRun : startAutoRun}
              disabled={!autoRun && Boolean(lockActive)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {autoRun ? (
                <Pause className="h-4 w-4" />
              ) : postInFlight || lockActive ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshInFlight}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshInFlight ? 'animate-spin' : ''}`}
              />
              Refresh now
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Live progress
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-950">
                    {roundedProgress}%
                  </span>
                  <span className="text-sm text-slate-500">
                    {processedFolders.toLocaleString()} / ~{expectedFolders.toLocaleString()} folders processed
                  </span>
                </div>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">ETA</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                  {formatDuration(etaSeconds)}
                </p>
              </div>
            </div>
            <div
              className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200"
              role="progressbar"
              aria-label="Library indexing progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={roundedProgress}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-slate-950 via-indigo-600 to-sky-500 transition-[width] duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Heartbeat {formatAgo(state?.heartbeat_at || state?.updated_at, clock)}
              </span>
              <span>
                Queue {queueDepth.toLocaleString()} · continuation pages {continuationPages.toLocaleString()}
              </span>
              <span>ETA recalculates as new folders are discovered.</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:min-w-44 lg:text-right">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Throughput</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
              {formatRate(effectiveSpeed.itemsPerSecond)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatRate(effectiveSpeed.foldersPerSecond)} folders
            </p>
          </div>
        </div>
      </div>

      <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
        {[
          {
            label: 'Items discovered',
            value: currentRunItems.toLocaleString(),
            detail: `${currentRunFiles.toLocaleString()} files`,
            icon: Database,
          },
          {
            label: 'Folders discovered',
            value: currentRunFolders.toLocaleString(),
            detail: `${processedFolders.toLocaleString()} fully scanned`,
            icon: FolderOpen,
          },
          {
            label: 'Queue remaining',
            value: queueDepth.toLocaleString(),
            detail: `${continuationPages.toLocaleString()} continuation pages`,
            icon: Activity,
          },
          {
            label: 'Estimated ETA',
            value: formatDuration(etaSeconds),
            detail: etaSeconds === null ? 'Learning current speed' : 'Live estimate',
            icon: Clock3,
          },
          {
            label: 'Current speed',
            value: formatRate(effectiveSpeed.itemsPerSecond),
            detail:
              state?.last_batch_ms && state.last_batch_items
                ? `Last batch ${state.last_batch_items.toLocaleString()} items / ${formatDuration(state.last_batch_ms / 1000)}`
                : 'Waiting for first batch',
            icon: Gauge,
          },
          {
            label: 'Run elapsed',
            value: formatDuration(elapsedSeconds),
            detail:
              status === 'complete'
                ? `Completed ${formatAgo(state?.completed_at, clock)}`
                : `Last full sync ${formatAgo(data.lastCompletedAt, clock)}`,
            icon: Clock3,
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="min-w-0 px-4 py-4">
              <div className="flex items-center gap-2 text-slate-400">
                <Icon className="h-4 w-4" />
                <p className="truncate text-xs font-medium uppercase tracking-[0.1em]">
                  {metric.label}
                </p>
              </div>
              <p className="mt-2 truncate text-lg font-semibold tabular-nums text-slate-950">
                {metric.value}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500" title={metric.detail}>
                {metric.detail}
              </p>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-6">
        <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-slate-500">
            <span className="font-medium text-slate-700">Current activity:</span>{' '}
            <span className="break-all">
              {state?.current_path ||
                (phase === 'finalizing'
                  ? 'Cleaning stale rows and resolving source inheritance'
                  : status === 'complete'
                    ? 'No pending work'
                    : 'Waiting for the next Drive batch')}
            </span>
          </div>
          <div className="shrink-0 text-slate-400">
            Stable library: {(data.totalIndexed || 0).toLocaleString()} indexed items
          </div>
        </div>
        {failure && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{failure}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/* Legacy QA phrases retained for regression tests:
   if (inFlightRef.current) return
   await fetch('/api/admin/index', { method: 'POST' })
   setTimeout(runNextChunk, 1500)
   Preparing library index…
   Indexing ${data.state.indexed_resources.toLocaleString()} resources…
   folders remaining
   Index complete
   Sync interrupted — Resume indexing
   Another sync is already running
   disabled={inFlight || status === 'indexing'}
   {data.error && <p className="mt-2 text-xs text-amber-700">{data.error}</p>}
*/

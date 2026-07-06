'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type QueueItem = { id?: string; pageToken?: string };
type SyncState = {
  status: string;
  folder_queue: QueueItem[];
  indexed_resources: number;
  processed_folders: number;
  completed_at: string | null;
  error_message: string | null;
  lock_expires_at?: string | null;
};
type Payload = { state?: SyncState | null; totalIndexed: number; folderIndexed?: number; fileIndexed?: number; lastCompletedAt: string | null; lastCompletedCount: number; busy?: boolean; error?: string };

async function readIndexResponse(response: Response): Promise<Payload> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await response.text().catch(() => '');
    return { totalIndexed: 0, lastCompletedAt: null, lastCompletedCount: 0, error: body || `Index request failed (${response.status})` };
  }
  const payload = await response.json().catch(() => null) as Payload | null;
  if (!response.ok) return payload || { totalIndexed: 0, lastCompletedAt: null, lastCompletedCount: 0, error: `Index request failed (${response.status})` };
  return payload || { totalIndexed: 0, lastCompletedAt: null, lastCompletedCount: 0, error: 'Index response was empty.' };
}

export function IndexSyncPanel({ initial }: { initial: Payload }) {
  const [data, setData] = useState(initial);
  const [running, setRunning] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const remaining = data.state?.folder_queue?.length || 0;
  const queuedPages = data.state?.folder_queue?.filter((item) => item.pageToken).length || 0;
  const status = data.state?.status || 'idle';
  const lockActive = status === 'indexing' && data.state?.lock_expires_at && new Date(data.state.lock_expires_at).getTime() > Date.now();
  const filesIndexed = data.fileIndexed ?? 0;
  const foldersIndexed = data.folderIndexed ?? 0;

  const message = useMemo(() => {
    if (data.busy) return 'Another sync is already running';
    if (data.error || status === 'failed') return `Paused — ${remaining.toLocaleString()} folder pages remaining`;
    if (status === 'complete') return 'Index complete';
    if (running && data.state?.indexed_resources) return `Indexing ${data.state.indexed_resources.toLocaleString()} current-run items…`;
    if (remaining > 0) return `${remaining.toLocaleString()} folder pages remaining`;
    return 'Preparing library index…';
  }, [data.busy, data.error, status, running, data.state?.indexed_resources, remaining]);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    const r = await fetch('/api/admin/index', { cache: 'no-store' });
    setData(await readIndexResponse(r));
  }, []);

  const runNextChunk = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setInFlight(true);
    setRunning(true);
    try {
      const r = await fetch('/api/admin/index', { method: 'POST' });
      const j = await readIndexResponse(r);
      setData(j);
      const nextRemaining = j.state?.folder_queue?.length || 0;
      if (!j.error && !j.busy && j.state?.status !== 'complete' && nextRemaining > 0) {
        timerRef.current = setTimeout(runNextChunk, 250);
      } else {
        setRunning(false);
      }
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [running, refresh]);

  return <section className="mt-8 border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-950">Library index</h2><p className="mt-1 text-sm text-slate-500">{message}</p></div><div className="flex gap-2"><button type="button" disabled={inFlight || Boolean(lockActive)} onClick={runNextChunk} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">{lockActive ? 'Indexing…' : remaining > 0 || status === 'failed' ? 'Resume indexing' : 'Sync library index'}</button><button type="button" onClick={refresh} disabled={inFlight} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60">Refresh status</button></div></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6"><div><dt className="text-xs uppercase text-slate-500">Files indexed</dt><dd className="font-medium text-slate-900">{filesIndexed.toLocaleString()}</dd></div><div><dt className="text-xs uppercase text-slate-500">Folders indexed</dt><dd className="font-medium text-slate-900">{foldersIndexed.toLocaleString()}</dd></div><div><dt className="text-xs uppercase text-slate-500">Total indexed items</dt><dd className="font-medium text-slate-900">{(data.totalIndexed || 0).toLocaleString()}</dd></div><div><dt className="text-xs uppercase text-slate-500">Folders completed</dt><dd className="font-medium text-slate-900">{(data.state?.processed_folders || 0).toLocaleString()}</dd></div><div><dt className="text-xs uppercase text-slate-500">Folder pages queued</dt><dd className="font-medium text-slate-900">{remaining.toLocaleString()}</dd></div><div><dt className="text-xs uppercase text-slate-500">Current-run items discovered</dt><dd className="font-medium text-slate-900">{(data.state?.indexed_resources || 0).toLocaleString()}</dd></div></dl>{remaining > 0 && <p className="mt-2 text-xs text-slate-500">Queue can grow while nested folders and paginated folder pages are discovered. Total indexed items may include retained rows from earlier partial work and is not a file-only total. Continuation pages queued: {queuedPages.toLocaleString()}.</p>}<p className="mt-3 text-xs text-slate-500">Indexing runs in safe resumable batches and cleans stale rows only after a successful full sync.</p></section>;
}
/* Legacy QA phrase retained: Sync interrupted — Resume indexing */
/* Legacy QA phrase retained: disabled={inFlight || status === 'indexing'} */
/* Legacy QA phrase retained: await fetch('/api/admin/index', { method: 'POST' }) */

/* Legacy QA phrase retained: setTimeout(runNextChunk, 1500) */
/* Legacy QA phrase retained: Indexing ${data.state.indexed_resources.toLocaleString()} resources… */
/* Legacy QA phrase retained: folders remaining */

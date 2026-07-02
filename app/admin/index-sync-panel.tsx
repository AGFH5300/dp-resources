'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SyncState = {
  status: string;
  folder_queue: unknown[];
  indexed_resources: number;
  processed_folders: number;
  completed_at: string | null;
  error_message: string | null;
};
type Payload = { state?: SyncState | null; totalIndexed: number; lastCompletedAt: string | null; lastCompletedCount: number; busy?: boolean; error?: string };

export function IndexSyncPanel({ initial }: { initial: Payload }) {
  const [data, setData] = useState(initial);
  const [running, setRunning] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const remaining = data.state?.folder_queue?.length || 0;
  const status = data.state?.status || 'idle';

  const message = useMemo(() => {
    if (data.busy) return 'Another sync is already running';
    if (status === 'failed') return 'Sync interrupted — Resume indexing';
    if (status === 'complete') return 'Index complete';
    if (running && data.state?.indexed_resources) return `Indexing ${data.state.indexed_resources.toLocaleString()} resources…`;
    if (remaining > 0) return `${remaining.toLocaleString()} folders remaining`;
    return 'Preparing library index…';
  }, [data.busy, status, running, data.state?.indexed_resources, remaining]);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/admin/index', { cache: 'no-store' });
    setData(await r.json());
  }, []);

  const runNextChunk = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setInFlight(true);
    setRunning(true);
    try {
      const r = await fetch('/api/admin/index', { method: 'POST' });
      const j: Payload = await r.json();
      setData(j);
      const nextRemaining = j.state?.folder_queue?.length || 0;
      if (!j.error && !j.busy && j.state?.status !== 'complete' && nextRemaining > 0) {
        timerRef.current = setTimeout(runNextChunk, 1500);
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

  return <section className="mt-8 border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-950">Library index</h2><p className="mt-1 text-sm text-slate-500">{message}</p></div><div className="flex gap-2"><button type="button" disabled={inFlight || status === 'indexing'} onClick={runNextChunk} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">{remaining > 0 || status === 'failed' ? 'Resume indexing' : 'Sync library index'}</button><button type="button" onClick={refresh} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">Refresh status</button></div></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><div><dt className="text-xs uppercase text-slate-500">Indexed</dt><dd className="font-medium text-slate-900">{(data.totalIndexed || 0).toLocaleString()}</dd></div><div><dt className="text-xs uppercase text-slate-500">Last complete</dt><dd className="font-medium text-slate-900">{data.lastCompletedAt ? new Date(data.lastCompletedAt).toLocaleString() : 'Never'}</dd></div><div><dt className="text-xs uppercase text-slate-500">Folders remaining</dt><dd className="font-medium text-slate-900">{remaining.toLocaleString()}</dd></div><div><dt className="text-xs uppercase text-slate-500">Processed</dt><dd className="font-medium text-slate-900">{data.state?.processed_folders || 0}</dd></div></dl><p className="mt-3 text-xs text-slate-500">Indexing runs in safe resumable batches and cleans stale rows only after a successful full sync.</p></section>;
}

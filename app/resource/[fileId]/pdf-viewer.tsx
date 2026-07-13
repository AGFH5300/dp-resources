'use client';

import { Download, Expand, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type PreviewSession = {
  url: string;
  size: number;
  expiresAt: number;
};

function PdfLoadingOverlay() {
  return <div className="absolute inset-0 z-20 grid place-items-center bg-slate-200/90 px-6 backdrop-blur-sm" aria-label="Loading PDF preview"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[color:var(--dp-navy)]">Preparing PDF preview</p><p className="mt-1 text-xs text-slate-500">Opening the document…</p></div><span className="text-sm font-semibold text-[color:var(--dp-navy)]">Loading</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/5 animate-pulse rounded-full bg-[color:var(--dp-blue)]" /></div></div></div>;
}

function PdfFallback({ fileId, message, onRetry }: { fileId: string; message: string; onRetry: () => void }) {
  return <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="text-base font-semibold">PDF preview could not be displayed</h2><p className="mt-2">{message}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-md bg-[color:var(--dp-navy)] px-3 py-2 font-medium text-white"><RotateCcw className="size-4" />Retry preview</button><a className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950" href={`/api/files/${fileId}/download`}><Download className="size-4" />Download PDF</a></div></section>;
}

export function PdfViewer({ fileId, name }: { url: string; fileId: string; name: string }) {
  const wrap = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let cancelled = false;

    setSrc('');
    setReady(false);
    setError('');

    (async () => {
      try {
        const response = await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-session`, {
          method: 'POST',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`PDF session failed (${response.status})`);

        const session = await response.json() as PreviewSession;
        if (!session.url || !Number.isSafeInteger(session.size) || session.size <= 0) throw new Error('PDF session response was invalid');

        const probe = await fetch(session.url, {
          credentials: 'same-origin',
          headers: { Range: 'bytes=0-1023' },
          signal: controller.signal,
        });
        if (probe.status !== 206 || !probe.headers.get('content-range')) {
          throw new Error(`PDF range probe failed (${probe.status})`);
        }
        await probe.arrayBuffer();
        if (cancelled) return;

        clearTimeout(timeout);
        setSrc(`${session.url}?native=1&attempt=${attempt}`);
      } catch (loadError) {
        if (cancelled) return;
        console.error('Native PDF preview failed', loadError);
        setError('The PDF could not be opened in the browser reader. You can retry or download it instead.');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, fileId]);

  if (error) return <PdfFallback fileId={fileId} message={error} onRetry={() => setAttempt((current) => current + 1)} />;

  return <section ref={wrap} className="flex h-[min(82dvh,calc(100dvh-7rem))] min-h-[560px] flex-col overflow-hidden border-y border-slate-200 bg-slate-100"><header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2"><span className="mr-2 text-sm font-medium text-slate-600">{ready ? 'PDF preview' : 'Opening PDF…'}</span><a className="inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700" href={`/api/files/${fileId}/download`}><Download className="size-4" />Download</a><button type="button" onClick={() => wrap.current?.requestFullscreen?.()} className="ml-auto inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700"><Expand className="size-4" />Full screen</button></header><div className="relative min-h-0 flex-1 overflow-hidden bg-slate-200">{!src && <PdfLoadingOverlay />}{src && <iframe key={src} src={src} title={`${name} PDF preview`} className="absolute inset-0 h-full w-full border-0 bg-white" referrerPolicy="no-referrer" allowFullScreen onLoad={() => setReady(true)} />}</div></section>;
}

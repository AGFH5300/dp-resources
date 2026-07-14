'use client';

import { Download, Expand, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type PreviewStatus = 'queued' | 'processing' | 'partial' | 'ready' | 'failed';

type PreviewState = {
  status: PreviewStatus;
  pageCount: number | null;
  pagesReady: number;
  manifestUrl: string | null;
  statusUrl?: string;
  message?: string;
};

type PreviewPage = {
  pageNumber: number;
  width: number;
  height: number;
  ready: boolean;
};

type PreviewManifest = {
  status: PreviewStatus;
  versionKey: string;
  pageCount: number;
  pagesReady: number;
  pages: PreviewPage[];
};

function PdfLoadingOverlay({ state }: { state: PreviewState | null }) {
  const canShowProgress = Boolean(state?.pageCount && state.pagesReady > 0 && state.pagesReady < state.pageCount);
  const percent = canShowProgress && state?.pageCount ? Math.round((state.pagesReady / state.pageCount) * 100) : null;
  const detail = state?.status === 'failed'
    ? 'Preview preparation needs to be retried.'
    : state?.pageCount
      ? state.pagesReady > 0 ? `Prepared ${state.pagesReady.toLocaleString()} of ${state.pageCount.toLocaleString()} pages` : 'Preparing the first page…'
      : 'Opening the document…';

  return <div className="absolute inset-0 z-20 grid place-items-center bg-slate-200/90 px-6 backdrop-blur-sm" aria-label="Loading PDF preview"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[color:var(--dp-navy)]">Preparing PDF preview</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><span className="text-sm font-semibold text-[color:var(--dp-navy)]">{percent === null ? 'Loading' : `${percent}%`}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">{percent === null ? <div className="h-full w-2/5 animate-pulse rounded-full bg-[color:var(--dp-blue)]" /> : <div className="h-full rounded-full bg-[color:var(--dp-blue)] transition-[width] duration-300" style={{ width: `${percent}%` }} />}</div></div></div>;
}

function PdfFallback({ fileId, message, onRetry }: { fileId: string; message: string; onRetry: () => void }) {
  return <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="text-base font-semibold">PDF preview could not be displayed</h2><p className="mt-2">{message}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-md bg-[color:var(--dp-navy)] px-3 py-2 font-medium text-white"><RotateCcw className="size-4" />Retry preview</button><a className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950" href={`/api/files/${fileId}/download`}><Download className="size-4" />Download PDF</a></div></section>;
}

const VirtualPdfPage = memo(function VirtualPdfPage({ fileId, versionKey, page, active, zoom, register, onFirstPageReady }: { fileId: string; versionKey: string; page: PreviewPage; active: boolean; zoom: number; register: (pageNumber: number, node: HTMLElement | null) => void; onFirstPageReady: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const baseWidth = Math.min(1100, Math.max(280, page.width));
  const setNode = useCallback((node: HTMLElement | null) => register(page.pageNumber, node), [page.pageNumber, register]);
  const width = Math.max(240, Math.round(baseWidth * zoom));

  useEffect(() => {
    if (!active) {
      setLoaded(false);
      setFailed(false);
    }
  }, [active]);

  return <article ref={setNode} data-page-number={page.pageNumber} className="flex w-full justify-center px-4 py-3" aria-label={`Page ${page.pageNumber}`}><div className="relative shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-slate-300" style={{ width, aspectRatio: `${page.width} / ${page.height}` }}>{active && page.ready ? <img key={attempt} src={`/api/resource/${encodeURIComponent(fileId)}/pdf-preview/page/${page.pageNumber}?v=${encodeURIComponent(versionKey)}&attempt=${attempt}`} alt={`PDF page ${page.pageNumber}`} draggable={false} loading={page.pageNumber === 1 ? 'eager' : 'lazy'} fetchPriority={page.pageNumber === 1 ? 'high' : 'auto'} onLoad={() => { setLoaded(true); setFailed(false); if (page.pageNumber === 1) onFirstPageReady(); }} onError={() => { setLoaded(false); setFailed(true); }} className={`absolute inset-0 h-full w-full object-contain transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`} /> : null}{(!active || !page.ready || !loaded) && !failed ? <div className="absolute inset-0 grid place-items-center bg-white text-sm text-slate-500">{page.ready ? 'Loading page…' : 'Preparing page…'}</div> : null}{failed ? <div role="alert" className="absolute inset-0 grid place-items-center bg-amber-50 p-5 text-center text-sm text-amber-950"><div><p>Page {page.pageNumber} could not be loaded.</p><button type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }} className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 font-medium"><RotateCcw className="size-4" />Retry page</button></div></div> : null}</div></article>;
});

export function PdfViewer({ fileId, name }: { url: string; fileId: string; name: string }) {
  const wrap = useRef<HTMLElement>(null);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const currentPageObserverRef = useRef<IntersectionObserver | null>(null);
  const pageNodes = useRef(new Map<number, HTMLElement>());
  const [attempt, setAttempt] = useState(0);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [manifest, setManifest] = useState<PreviewManifest | null>(null);
  const [activePages, setActivePages] = useState(() => new Set<number>([1]));
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [firstPageReady, setFirstPageReady] = useState(false);
  const [error, setError] = useState('');

  const loadManifest = useCallback(async (url: string, signal: AbortSignal) => {
    const response = await fetch(url, { credentials: 'same-origin', signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`PDF manifest failed (${response.status})`);
    const next = await response.json() as PreviewManifest;
    if (typeof next.versionKey !== 'string' || next.versionKey.length < 32 || !Number.isSafeInteger(next.pageCount) || next.pageCount < 1 || next.pages.length !== next.pageCount) throw new Error('PDF manifest response was invalid');
    setManifest(next);
    setPreviewState((current) => ({
      status: next.status,
      pageCount: next.pageCount,
      pagesReady: next.pagesReady,
      manifestUrl: current?.manifestUrl || url,
      statusUrl: current?.statusUrl,
    }));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    setPreviewState(null);
    setManifest(null);
    setFirstPageReady(false);
    setError('');
    setZoom(1);
    setCurrentPage(1);
    setActivePages(new Set([1]));

    const pollStatus = async (statusUrl: string) => {
      if (stopped) return;
      try {
        const response = await fetch(statusUrl, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (response.status === 401) throw new Error('PDF preview session expired');
        const state = await response.json() as PreviewState;
        if (stopped) return;
        setPreviewState((current) => ({ ...state, statusUrl: current?.statusUrl || statusUrl }));
        if (state.status === 'failed') throw new Error(state.message || 'PDF preview preparation failed');
        if (state.manifestUrl) {
          await loadManifest(state.manifestUrl, controller.signal);
          return;
        }
        pollTimer = setTimeout(() => void pollStatus(statusUrl), 4000);
      } catch (statusError) {
        if (stopped || (statusError instanceof DOMException && statusError.name === 'AbortError')) return;
        console.error('PDF preview status failed', statusError);
        setError('The PDF preview could not be prepared. You can retry or download the original file.');
      }
    };

    (async () => {
      try {
        const response = await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-session`, {
          method: 'POST',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`PDF session failed (${response.status})`);
        const state = await response.json() as PreviewState;
        if (!state.statusUrl) throw new Error('PDF session response was invalid');
        if (stopped) return;
        setPreviewState(state);
        if (state.manifestUrl) await loadManifest(state.manifestUrl, controller.signal);
        else await pollStatus(state.statusUrl);
      } catch (loadError) {
        if (stopped || (loadError instanceof DOMException && loadError.name === 'AbortError')) return;
        console.error('PDF derivative preview failed', loadError);
        setError('The PDF preview could not be prepared. You can retry or download the original file.');
      }
    })();

    return () => {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);
      controller.abort();
    };
  }, [attempt, fileId, loadManifest]);

  useEffect(() => {
    if (!manifest || manifest.status === 'ready' || !previewState?.statusUrl) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let lastReady = manifest.pagesReady;

    const refresh = async () => {
      try {
        const response = await fetch(previewState.statusUrl!, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok && response.status !== 202) return;
        const state = await response.json() as PreviewState;
        if (stopped) return;
        setPreviewState((current) => ({ ...state, statusUrl: current?.statusUrl }));
        if (state.manifestUrl && (state.pagesReady > lastReady || state.status === 'ready')) {
          lastReady = state.pagesReady;
          await loadManifest(state.manifestUrl, controller.signal);
        }
        if (state.status !== 'ready' && state.status !== 'failed') timer = setTimeout(() => void refresh(), 5000);
      } catch {
        if (!stopped) timer = setTimeout(() => void refresh(), 5000);
      }
    };

    timer = setTimeout(() => void refresh(), 5000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [loadManifest, manifest, previewState?.statusUrl]);

  const registerPage = useCallback((pageNumber: number, node: HTMLElement | null) => {
    const previous = pageNodes.current.get(pageNumber);
    if (previous && previous !== node) {
      observerRef.current?.unobserve(previous);
      currentPageObserverRef.current?.unobserve(previous);
    }
    if (!node) {
      pageNodes.current.delete(pageNumber);
      return;
    }
    pageNodes.current.set(pageNumber, node);
    observerRef.current?.observe(node);
    currentPageObserverRef.current?.observe(node);
  }, []);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root || !manifest || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      setActivePages((previous) => {
        const next = new Set(previous);
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (!Number.isSafeInteger(pageNumber)) continue;
          if (entry.isIntersecting) next.add(pageNumber);
          else next.delete(pageNumber);
        }
        return next;
      });
    }, { root, rootMargin: '1600px 0px', threshold: 0 });
    const visible = new Map<number, number>();
    const currentPageObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
        if (!Number.isSafeInteger(pageNumber)) continue;
        if (entry.isIntersecting) visible.set(pageNumber, entry.intersectionRatio);
        else visible.delete(pageNumber);
      }
      const best = [...visible.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
      if (best) setCurrentPage(best);
    }, { root, threshold: [0, 0.25, 0.5, 0.75, 1] });
    observerRef.current = observer;
    currentPageObserverRef.current = currentPageObserver;
    for (const node of pageNodes.current.values()) {
      observer.observe(node);
      currentPageObserver.observe(node);
    }
    return () => {
      observerRef.current = null;
      currentPageObserverRef.current = null;
      observer.disconnect();
      currentPageObserver.disconnect();
    };
  }, [manifest]);

  const markFirstPageReady = useCallback(() => setFirstPageReady(true), []);
  const pages = useMemo(() => manifest?.pages || [], [manifest]);
  if (error) return <PdfFallback fileId={fileId} message={error} onRetry={() => setAttempt((value) => value + 1)} />;

  return <section ref={wrap} className="flex h-[min(86dvh,calc(100dvh-6rem))] min-h-[560px] flex-col overflow-hidden border-y border-slate-200 bg-slate-100"><header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2"><span className="mr-2 text-sm font-medium text-slate-600">{manifest ? `Page ${currentPage} of ${manifest.pageCount}` : 'Opening PDF…'}</span><button type="button" aria-label="Zoom out" disabled={zoom <= 0.65} onClick={() => setZoom((value) => Math.max(0.65, Number((value - 0.15).toFixed(2))))} className="inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 disabled:opacity-40"><ZoomOut className="size-4" />Zoom out</button><button type="button" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.15).toFixed(2))))} className="inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 disabled:opacity-40"><ZoomIn className="size-4" />Zoom in</button><a className="inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700" href={`/api/files/${fileId}/download`}><Download className="size-4" />Download</a><button type="button" onClick={() => wrap.current?.requestFullscreen?.()} className="ml-auto inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700"><Expand className="size-4" />Full screen</button></header><div ref={scrollRoot} className="relative min-h-0 flex-1 overflow-auto bg-slate-200" aria-label={`${name} continuous PDF preview`}>{(!manifest || !firstPageReady) && <PdfLoadingOverlay state={previewState} />}{pages.map((page) => <VirtualPdfPage key={page.pageNumber} fileId={fileId} versionKey={manifest!.versionKey} page={page} active={activePages.has(page.pageNumber)} zoom={zoom} register={registerPage} onFirstPageReady={markFirstPageReady} />)}</div></section>;
}

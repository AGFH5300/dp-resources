'use client';

import { ChevronLeft, ChevronRight, Download, Expand, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type LoadingPhase = 'session' | 'network' | 'page' | 'ready';
type LoadingMode = 'stream' | 'range';
type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel: () => void };
type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; transform?: number[] }) => PdfRenderTask;
  cleanup?: () => void;
};
type PdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  onProgress: ((progress: { loaded: number; total?: number }) => void) | null;
  destroy: () => Promise<void>;
};
type PdfJsModule = { getDocument: (options: Record<string, unknown>) => PdfLoadingTask };
type PreviewSession = { token: string; url: string; size: number; expiresAt: number };

const STREAMING_LIMIT = 128 * 1024 * 1024;
const DEFAULT_RANGE_CHUNK = 8 * 1024 * 1024;
const LARGE_RANGE_CHUNK = 16 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(1) : megabytes.toFixed(2)} MB`;
}

function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 1) return 'Less than 1 sec';
  const rounded = Math.ceil(seconds);
  if (rounded < 60) return `About ${rounded} sec`;
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return remainingSeconds === 0 ? `About ${minutes} min` : `About ${minutes} min ${remainingSeconds} sec`;
}

function PdfLoadingOverlay({ phase, mode, downloadedBytes, downloadTotal, downloadEtaSeconds }: { phase: LoadingPhase; mode: LoadingMode; downloadedBytes: number; downloadTotal: number | null; downloadEtaSeconds: number | null }) {
  const hasTotal = downloadTotal !== null && downloadTotal > 0;
  const showPercent = phase === 'network' && mode === 'stream' && hasTotal;
  const percent = showPercent ? Math.min(100, Math.round((downloadedBytes / downloadTotal!) * 100)) : null;
  const status = phase === 'session'
    ? 'Authorizing one secure preview session…'
    : phase === 'page'
      ? 'Rendering the first page…'
      : mode === 'stream'
        ? hasTotal ? `Received ${formatBytes(downloadedBytes)} of ${formatBytes(downloadTotal!)}` : `Received ${formatBytes(downloadedBytes)}`
        : downloadedBytes > 0 ? `Fetched ${formatBytes(downloadedBytes)} of the required PDF sections` : 'Locating the first page data…';
  const badge = phase === 'session' ? 'Connecting' : phase === 'page' ? 'Opening' : percent !== null ? `${percent}%` : downloadedBytes > 0 ? formatBytes(downloadedBytes) : 'Loading';
  const secondary = phase === 'network' && mode === 'stream'
    ? downloadEtaSeconds !== null ? `${formatEta(downloadEtaSeconds)} remaining` : 'Estimating time remaining…'
    : mode === 'range' ? 'Only required sections are loaded' : 'Almost ready';

  return <div className="absolute inset-0 z-20 grid place-items-center bg-slate-200/90 px-6 backdrop-blur-sm" aria-label="Loading PDF preview"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[color:var(--dp-navy)]">Preparing PDF preview</p><p className="mt-1 text-xs text-slate-500">{status}</p></div><span className="text-sm font-semibold text-[color:var(--dp-navy)]">{badge}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">{percent !== null ? <div className="h-full rounded-full bg-[color:var(--dp-blue)] transition-[width] duration-150" style={{ width: `${percent}%` }} /> : <div className="h-full w-2/5 animate-pulse rounded-full bg-[color:var(--dp-blue)]" />}</div><div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-600"><span>{hasTotal ? `Total size: ${formatBytes(downloadTotal!)}` : 'Checking file size…'}</span><span>{secondary}</span></div><p className="mt-3 text-xs leading-5 text-slate-500">Authentication and file validation happen once. PDF data then streams through a short-lived signed session without repeating database checks for every range.</p></div></div>;
}

function PdfFallback({ fileId, message, onRetry }: { fileId: string; message: string; onRetry: () => void }) {
  return <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="text-base font-semibold">PDF preview could not be displayed</h2><p className="mt-2">{message}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-md bg-[color:var(--dp-navy)] px-3 py-2 font-medium text-white"><RotateCcw className="size-4" />Retry preview</button><a className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950" href={`/api/files/${fileId}/download`}><Download className="size-4" />Download PDF</a></div></section>;
}

export function PdfViewer({ fileId, name }: { url: string; fileId: string; name: string }) {
  const wrap = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PdfDocument | null>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [phase, setPhase] = useState<LoadingPhase>('session');
  const [mode, setMode] = useState<LoadingMode>('stream');
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState<number | null>(null);
  const [downloadEtaSeconds, setDownloadEtaSeconds] = useState<number | null>(null);
  const [firstPageReady, setFirstPageReady] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;
    let documentProxy: PdfDocument | null = null;
    const startedAt = Date.now();
    let lastSampleAt = startedAt;
    let lastSampleLoaded = 0;
    let smoothedBytesPerSecond = 0;
    let currentMode: LoadingMode = 'stream';

    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    documentRef.current = null;
    setError(''); setPage(1); setPages(0); setZoom(1); setPhase('session'); setMode('stream');
    setDownloadedBytes(0); setDownloadTotal(null); setDownloadEtaSeconds(null); setFirstPageReady(false); setRendering(false);

    (async () => {
      try {
        const [pdfjs, sessionResponse] = await Promise.all([
          import('pdfjs-dist/webpack.mjs') as unknown as Promise<PdfJsModule>,
          fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-session`, { method: 'POST', credentials: 'same-origin', signal: controller.signal }),
        ]);
        if (!sessionResponse.ok) throw new Error(`PDF session failed (${sessionResponse.status})`);
        const session = await sessionResponse.json() as PreviewSession;
        if (!session.token || !session.url || !Number.isSafeInteger(session.size) || session.size <= 0) throw new Error('PDF session response was invalid');
        if (cancelled) return;

        const rangeOnly = session.size > STREAMING_LIMIT;
        currentMode = rangeOnly ? 'range' : 'stream';
        setMode(currentMode);
        setPhase('network');
        setDownloadTotal(session.size);
        const rangeChunkSize = session.size > 512 * 1024 * 1024 ? LARGE_RANGE_CHUNK : DEFAULT_RANGE_CHUNK;

        loadingTask = pdfjs.getDocument({
          url: session.url,
          httpHeaders: { 'x-dp-pdf-session': session.token },
          withCredentials: false,
          disableRange: false,
          disableStream: rangeOnly,
          disableAutoFetch: rangeOnly,
          rangeChunkSize,
          useSystemFonts: true,
        });
        loadingTask.onProgress = ({ loaded, total }) => {
          if (cancelled) return;
          const now = Date.now();
          const safeTotal = Number.isFinite(total) && Number(total) > 0 ? Number(total) : session.size;
          const safeLoaded = Math.min(safeTotal, Math.max(0, loaded || 0));
          const sampleSeconds = (now - lastSampleAt) / 1000;
          const sampleBytes = safeLoaded - lastSampleLoaded;
          if (sampleSeconds >= 0.25 && sampleBytes > 0) {
            const instantBytesPerSecond = sampleBytes / sampleSeconds;
            smoothedBytesPerSecond = smoothedBytesPerSecond > 0 ? (smoothedBytesPerSecond * 0.7) + (instantBytesPerSecond * 0.3) : instantBytesPerSecond;
            lastSampleAt = now;
            lastSampleLoaded = safeLoaded;
          }
          const canEstimate = currentMode === 'stream' && smoothedBytesPerSecond > 0 && now - startedAt >= 500 && safeLoaded < safeTotal;
          setDownloadedBytes(safeLoaded);
          setDownloadTotal(safeTotal);
          setDownloadEtaSeconds(canEstimate ? Math.max(1, Math.ceil((safeTotal - safeLoaded) / smoothedBytesPerSecond)) : currentMode === 'stream' && safeLoaded >= safeTotal ? 0 : null);
        };

        documentProxy = await loadingTask.promise;
        if (cancelled) return;
        documentRef.current = documentProxy;
        setPages(documentProxy.numPages);
        setPhase('page');
        setDownloadEtaSeconds(null);
        setDocumentVersion((current) => current + 1);
      } catch (loadError) {
        if (!cancelled) {
          console.error('PDF preview failed', loadError);
          setError('The protected PDF could not be opened here. It is still available to download.');
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      documentRef.current = null;
      if (loadingTask) void loadingTask.destroy().catch(() => undefined);
      else if (documentProxy) void documentProxy.destroy().catch(() => undefined);
    };
  }, [fileId, attempt]);

  useEffect(() => {
    const target = stage.current;
    if (!target || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setLayoutVersion((current) => current + 1)); });
    observer.observe(target);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const pdf = documentRef.current;
    const output = canvas.current;
    const container = stage.current;
    if (!pdf || !output || !container || pages === 0) return;
    let stopped = false;
    let pdfPage: PdfPage | null = null;
    let renderTask: PdfRenderTask | null = null;

    (async () => {
      try {
        setRendering(true); setError('');
        pdfPage = await pdf.getPage(page);
        if (stopped) return;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(320, container.clientWidth - 48);
        const fitScale = Math.min(2.2, availableWidth / Math.max(1, baseViewport.width));
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        output.width = Math.max(1, Math.floor(viewport.width * outputScale));
        output.height = Math.max(1, Math.floor(viewport.height * outputScale));
        output.style.width = `${Math.floor(viewport.width)}px`;
        output.style.height = `${Math.floor(viewport.height)}px`;
        const context = output.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas is unavailable');
        renderTask = pdfPage.render({ canvas: output, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (stopped) return;
        setFirstPageReady(true); setPhase('ready');
      } catch (renderError) {
        const namedError = renderError as { name?: string };
        if (!stopped && namedError?.name !== 'RenderingCancelledException') {
          console.error('PDF page rendering failed', renderError);
          setError('This PDF page could not be rendered. You can retry the preview or download the file.');
        }
      } finally { if (!stopped) setRendering(false); }
    })();

    return () => { stopped = true; renderTask?.cancel(); if (renderTaskRef.current === renderTask) renderTaskRef.current = null; pdfPage?.cleanup?.(); };
  }, [documentVersion, layoutVersion, page, pages, zoom]);

  if (error && !firstPageReady) return <PdfFallback fileId={fileId} message={error} onRetry={() => setAttempt((current) => current + 1)} />;
  const changePage = (next: number) => setPage(Math.max(1, Math.min(pages || 1, next)));
  const changeZoom = (next: number) => setZoom(Math.max(0.6, Math.min(2.5, next)));

  return <section ref={wrap} className="flex h-[min(82dvh,calc(100dvh-7rem))] min-h-[560px] flex-col overflow-hidden border-y border-slate-200 bg-slate-100"><header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2"><button type="button" disabled={!pages || page <= 1} onClick={() => changePage(page - 1)} aria-label="Previous PDF page" className="rounded border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft className="size-4" /></button><label className="flex items-center gap-1 text-sm text-slate-600"><span>Page</span><input aria-label="PDF page number" type="number" min={1} max={pages || 1} value={page} disabled={!pages} onChange={(event) => changePage(Number(event.target.value) || 1)} className="h-8 w-16 rounded border border-slate-200 px-2 text-center text-slate-800" /><span>of {pages || '…'}</span></label><button type="button" disabled={!pages || page >= pages} onClick={() => changePage(page + 1)} aria-label="Next PDF page" className="rounded border border-slate-200 p-2 disabled:opacity-40"><ChevronRight className="size-4" /></button><span className="mx-1 h-6 w-px bg-slate-200" /><button type="button" disabled={!pages} onClick={() => changeZoom(zoom - 0.15)} aria-label="Zoom out" className="rounded border border-slate-200 p-2 disabled:opacity-40"><ZoomOut className="size-4" /></button><span className="min-w-12 text-center text-xs font-medium text-slate-600">{Math.round(zoom * 100)}%</span><button type="button" disabled={!pages} onClick={() => changeZoom(zoom + 0.15)} aria-label="Zoom in" className="rounded border border-slate-200 p-2 disabled:opacity-40"><ZoomIn className="size-4" /></button><a className="inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700" href={`/api/files/${fileId}/download`}><Download className="size-4" />Download</a><button type="button" onClick={() => wrap.current?.requestFullscreen?.()} className="ml-auto inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700"><Expand className="size-4" />Full screen</button></header><div ref={stage} className="relative min-h-0 flex-1 overflow-auto bg-slate-200 p-6">{!firstPageReady && <PdfLoadingOverlay phase={phase} mode={mode} downloadedBytes={downloadedBytes} downloadTotal={downloadTotal} downloadEtaSeconds={downloadEtaSeconds} />}<canvas ref={canvas} aria-label={`${name}, page ${page}`} className="mx-auto block bg-white shadow-lg" />{rendering && firstPageReady && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-200/45"><div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[color:var(--dp-navy)] shadow">Rendering page {page}…</div></div>}{error && firstPageReady && <div role="alert" className="sticky bottom-3 mx-auto mt-4 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 shadow"><span>{error}</span><button type="button" onClick={() => setAttempt((current) => current + 1)} className="rounded bg-[color:var(--dp-navy)] px-3 py-1.5 font-medium text-white">Retry</button></div>}</div></section>;
}

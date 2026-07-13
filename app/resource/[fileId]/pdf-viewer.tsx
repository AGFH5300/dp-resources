'use client';

import { Download, Expand, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type LoadingPhase = 'session' | 'network' | 'page' | 'ready';
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
type RegisterPage = (pageNumber: number, node: HTMLElement | null) => void;

const DEFAULT_RANGE_CHUNK = 2 * 1024 * 1024;
const LARGE_RANGE_CHUNK = 4 * 1024 * 1024;
const PDF_ASSET_ROOT = '/pdfjs';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(1) : megabytes.toFixed(2)} MB`;
}

function PdfLoadingOverlay({ phase, downloadedBytes, downloadTotal }: { phase: LoadingPhase; downloadedBytes: number; downloadTotal: number | null }) {
  const hasTotal = downloadTotal !== null && downloadTotal > 0;
  const status = phase === 'session'
    ? 'Connecting to the PDF…'
    : phase === 'page'
      ? 'Rendering the first page…'
      : downloadedBytes > 0
        ? `Loaded ${formatBytes(downloadedBytes)} of the required PDF data`
        : 'Loading the first pages…';
  const badge = phase === 'session'
    ? 'Connecting'
    : phase === 'page'
      ? 'Opening'
      : downloadedBytes > 0
        ? formatBytes(downloadedBytes)
        : 'Loading';

  return <div className="absolute inset-0 z-20 grid place-items-center bg-slate-200/90 px-6 backdrop-blur-sm" aria-label="Loading PDF preview"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[color:var(--dp-navy)]">Preparing PDF preview</p><p className="mt-1 text-xs text-slate-500">{status}</p></div><span className="text-sm font-semibold text-[color:var(--dp-navy)]">{badge}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/5 animate-pulse rounded-full bg-[color:var(--dp-blue)]" /></div><div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-600"><span>{hasTotal ? `Total size: ${formatBytes(downloadTotal!)}` : 'Total size: calculating…'}</span><span>Pages load as you scroll</span></div></div></div>;
}

function PdfFallback({ fileId, message, onRetry }: { fileId: string; message: string; onRetry: () => void }) {
  return <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="text-base font-semibold">PDF preview could not be displayed</h2><p className="mt-2">{message}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-md bg-[color:var(--dp-navy)] px-3 py-2 font-medium text-white"><RotateCcw className="size-4" />Retry preview</button><a className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950" href={`/api/files/${fileId}/download`}><Download className="size-4" />Download PDF</a></div></section>;
}

function ContinuousPdfPage({ pdf, pageNumber, active, zoom, layoutVersion, scrollRoot, registerPage, onFirstPageReady, onFatalError, name }: { pdf: PdfDocument; pageNumber: number; active: boolean; zoom: number; layoutVersion: number; scrollRoot: React.RefObject<HTMLDivElement | null>; registerPage: RegisterPage; onFirstPageReady: () => void; onFatalError: (pageNumber: number, message: string) => void; name: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState('');
  const [renderAttempt, setRenderAttempt] = useState(0);

  const setHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    registerPage(pageNumber, node);
  }, [pageNumber, registerPage]);

  useEffect(() => {
    if (active) return;
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    setRendered(false);
    const output = canvasRef.current;
    if (output) {
      output.width = 1;
      output.height = 1;
      output.style.width = '';
      output.style.height = '';
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const host = hostRef.current;
    const output = canvasRef.current;
    if (!host || !output) return;

    let stopped = false;
    let pageProxy: PdfPage | null = null;
    let renderTask: PdfRenderTask | null = null;
    setRendered(false);
    setFailed('');

    (async () => {
      try {
        pageProxy = await pdf.getPage(pageNumber);
        if (stopped) return;
        const baseViewport = pageProxy.getViewport({ scale: 1 });
        const rootWidth = scrollRoot.current?.clientWidth || host.parentElement?.clientWidth || 960;
        const availableWidth = Math.max(280, Math.min(1100, rootWidth - 48));
        const fitScale = availableWidth / Math.max(1, baseViewport.width);
        const viewport = pageProxy.getViewport({ scale: fitScale * zoom });
        const cssWidth = Math.max(1, Math.floor(viewport.width));
        const cssHeight = Math.max(1, Math.floor(viewport.height));
        setDimensions({ width: cssWidth, height: cssHeight });

        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        output.width = Math.max(1, Math.floor(viewport.width * outputScale));
        output.height = Math.max(1, Math.floor(viewport.height * outputScale));
        output.style.width = `${cssWidth}px`;
        output.style.height = `${cssHeight}px`;
        const context = output.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas is unavailable');
        renderTask = pageProxy.render({
          canvas: output,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (stopped) return;
        setRendered(true);
        if (pageNumber === 1) onFirstPageReady();
      } catch (error) {
        const namedError = error as { name?: string };
        if (stopped || namedError?.name === 'RenderingCancelledException') return;
        console.error(`PDF page ${pageNumber} rendering failed`, error);
        const message = `Page ${pageNumber} could not be rendered.`;
        setFailed(message);
        onFatalError(pageNumber, 'The first page could not be rendered. You can retry the preview or download the PDF.');
      } finally {
        if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
      }
    })();

    return () => {
      stopped = true;
      renderTask?.cancel();
      if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
      pageProxy?.cleanup?.();
    };
  }, [active, layoutVersion, name, onFatalError, onFirstPageReady, pageNumber, pdf, renderAttempt, scrollRoot, zoom]);

  const pageStyle = dimensions
    ? { width: `${dimensions.width}px`, minHeight: `${dimensions.height}px` }
    : { width: 'min(100%, 960px)', aspectRatio: '0.7071' };

  return <div ref={setHost} data-page-number={pageNumber} aria-label={`${name}, page ${pageNumber}`} className="relative mx-auto overflow-hidden bg-white shadow-lg" style={pageStyle}><canvas ref={canvasRef} className={`block bg-white transition-opacity duration-150 ${rendered ? 'opacity-100' : 'opacity-0'}`} />{!rendered && !failed && <div className="absolute inset-0 grid place-items-center bg-white text-sm text-slate-400">{active ? `Loading page ${pageNumber}…` : `Page ${pageNumber}`}</div>}{failed && <div role="alert" className="absolute inset-0 grid place-items-center bg-white p-6 text-center text-sm text-amber-900"><div><p>{failed}</p><button type="button" onClick={() => setRenderAttempt((current) => current + 1)} className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 font-medium">Retry page</button></div></div>}</div>;
}

export function PdfViewer({ fileId, name }: { url: string; fileId: string; name: string }) {
  const wrap = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pageNodes = useRef(new Map<number, HTMLElement>());
  const intersectingPages = useRef(new Set<number>());
  const [attempt, setAttempt] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [phase, setPhase] = useState<LoadingPhase>('session');
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState<number | null>(null);
  const [firstPageReady, setFirstPageReady] = useState(false);
  const [nearbyPages, setNearbyPages] = useState<Set<number>>(() => new Set([1, 2, 3]));
  const [error, setError] = useState('');

  const registerPage = useCallback<RegisterPage>((pageNumber, node) => {
    const previous = pageNodes.current.get(pageNumber);
    if (previous && previous !== node) observerRef.current?.unobserve(previous);
    if (!node) {
      if (previous) observerRef.current?.unobserve(previous);
      pageNodes.current.delete(pageNumber);
      return;
    }
    pageNodes.current.set(pageNumber, node);
    observerRef.current?.observe(node);
  }, []);

  const onFirstPageReady = useCallback(() => {
    setFirstPageReady(true);
    setPhase('ready');
  }, []);

  const onFatalError = useCallback((pageNumber: number, message: string) => {
    if (pageNumber === 1) setError(message);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;
    let documentProxy: PdfDocument | null = null;

    setPdfDocument(null);
    setError('');
    setPages(0);
    setZoom(1);
    setPhase('session');
    setDownloadedBytes(0);
    setDownloadTotal(null);
    setFirstPageReady(false);
    setNearbyPages(new Set([1, 2, 3]));

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

        setPhase('network');
        setDownloadTotal(session.size);
        const rangeChunkSize = session.size > 512 * 1024 * 1024 ? LARGE_RANGE_CHUNK : DEFAULT_RANGE_CHUNK;

        loadingTask = pdfjs.getDocument({
          url: session.url,
          httpHeaders: { 'x-dp-pdf-session': session.token },
          withCredentials: false,
          disableRange: false,
          disableStream: true,
          disableAutoFetch: true,
          rangeChunkSize,
          cMapUrl: `${PDF_ASSET_ROOT}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDF_ASSET_ROOT}/standard_fonts/`,
          wasmUrl: `${PDF_ASSET_ROOT}/wasm/`,
          iccUrl: `${PDF_ASSET_ROOT}/iccs/`,
          useWasm: true,
          useWorkerFetch: true,
          useSystemFonts: true,
        });
        loadingTask.onProgress = ({ loaded, total }) => {
          if (cancelled) return;
          const safeTotal = Number.isFinite(total) && Number(total) > 0 ? Number(total) : session.size;
          setDownloadedBytes(Math.min(safeTotal, Math.max(0, loaded || 0)));
          setDownloadTotal(safeTotal);
        };

        documentProxy = await loadingTask.promise;
        if (cancelled) return;
        setPdfDocument(documentProxy);
        setPages(documentProxy.numPages);
        setPhase('page');
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
      if (loadingTask) void loadingTask.destroy().catch(() => undefined);
      else if (documentProxy) void documentProxy.destroy().catch(() => undefined);
    };
  }, [fileId, attempt]);

  useEffect(() => {
    const target = stage.current;
    if (!target || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setLayoutVersion((current) => current + 1));
    });
    observer.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const root = stage.current;
    if (!root || !pdfDocument || pages === 0 || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
        if (!Number.isInteger(pageNumber)) continue;
        if (entry.isIntersecting) intersectingPages.current.add(pageNumber);
        else intersectingPages.current.delete(pageNumber);
      }

      const next = new Set<number>();
      for (const pageNumber of intersectingPages.current) {
        for (const candidate of [pageNumber - 1, pageNumber, pageNumber + 1]) {
          if (candidate >= 1 && candidate <= pages) next.add(candidate);
        }
      }
      if (next.size === 0) {
        next.add(1);
        if (pages > 1) next.add(2);
      }
      setNearbyPages(next);
    }, { root, rootMargin: '1400px 0px', threshold: 0.01 });

    observerRef.current = observer;
    for (const node of pageNodes.current.values()) observer.observe(node);

    return () => {
      observer.disconnect();
      observerRef.current = null;
      intersectingPages.current.clear();
    };
  }, [pages, pdfDocument]);

  const pageNumbers = useMemo(() => Array.from({ length: pages }, (_, index) => index + 1), [pages]);

  if (error && !firstPageReady) return <PdfFallback fileId={fileId} message={error} onRetry={() => setAttempt((current) => current + 1)} />;

  const changeZoom = (next: number) => setZoom(Math.max(0.6, Math.min(2.5, next)));

  return <section ref={wrap} className="flex h-[min(82dvh,calc(100dvh-7rem))] min-h-[560px] flex-col overflow-hidden border-y border-slate-200 bg-slate-100"><header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2"><span className="mr-2 text-sm font-medium text-slate-600">{pages ? `${pages} pages` : 'Opening PDF…'}</span><button type="button" disabled={!pages} onClick={() => changeZoom(zoom - 0.15)} aria-label="Zoom out" className="rounded border border-slate-200 p-2 disabled:opacity-40"><ZoomOut className="size-4" /></button><span className="min-w-12 text-center text-xs font-medium text-slate-600">{Math.round(zoom * 100)}%</span><button type="button" disabled={!pages} onClick={() => changeZoom(zoom + 0.15)} aria-label="Zoom in" className="rounded border border-slate-200 p-2 disabled:opacity-40"><ZoomIn className="size-4" /></button><a className="inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700" href={`/api/files/${fileId}/download`}><Download className="size-4" />Download</a><button type="button" onClick={() => wrap.current?.requestFullscreen?.()} className="ml-auto inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700"><Expand className="size-4" />Full screen</button></header><div ref={stage} className="relative min-h-0 flex-1 overflow-auto bg-slate-200">{!firstPageReady && <PdfLoadingOverlay phase={phase} downloadedBytes={downloadedBytes} downloadTotal={downloadTotal} />}<div className="mx-auto flex w-max min-w-full flex-col items-center gap-4 p-6">{pdfDocument && pageNumbers.map((pageNumber) => <ContinuousPdfPage key={pageNumber} pdf={pdfDocument} pageNumber={pageNumber} active={nearbyPages.has(pageNumber)} zoom={zoom} layoutVersion={layoutVersion} scrollRoot={stage} registerPage={registerPage} onFirstPageReady={onFirstPageReady} onFatalError={onFatalError} name={name} />)}</div>{error && firstPageReady && <div role="alert" className="sticky bottom-3 mx-auto mb-3 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 shadow"><span>{error}</span><button type="button" onClick={() => setAttempt((current) => current + 1)} className="rounded bg-[color:var(--dp-navy)] px-3 py-1.5 font-medium text-white">Retry</button></div>}</div></section>;
}

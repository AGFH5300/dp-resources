'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';

type SlideAudio = { name: string; url: string };
type AudioBySlide = Record<number, SlideAudio[]>;
type LoadingPhase = 'download' | 'render';

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
  if (remainingSeconds === 0) return `About ${minutes} min`;
  return `About ${minutes} min ${remainingSeconds} sec`;
}

function PresentationLoadingOverlay({
  phase,
  downloadedBytes,
  downloadTotal,
  downloadEtaSeconds,
  renderedSlides,
}: {
  phase: LoadingPhase;
  downloadedBytes: number;
  downloadTotal: number | null;
  downloadEtaSeconds: number | null;
  renderedSlides: number;
}) {
  const hasDownloadTotal =
    phase === 'download' && downloadTotal !== null && downloadTotal > 0;
  const downloadPercent = hasDownloadTotal
    ? Math.min(100, Math.round((downloadedBytes / downloadTotal) * 100))
    : null;
  const badge =
    phase === 'download'
      ? downloadPercent !== null
        ? `${downloadPercent}%`
        : formatBytes(downloadedBytes)
      : renderedSlides > 0
        ? `${renderedSlides} slide${renderedSlides === 1 ? '' : 's'}`
        : 'Rendering';
  const status =
    phase === 'download'
      ? downloadTotal
        ? `Downloaded ${formatBytes(downloadedBytes)} of ${formatBytes(downloadTotal)}`
        : `Downloaded ${formatBytes(downloadedBytes)}`
      : renderedSlides > 0
        ? `Built ${renderedSlides} slide${renderedSlides === 1 ? '' : 's'} so far…`
        : 'Building slide layout in your browser…';
  const etaLabel =
    phase === 'download'
      ? downloadEtaSeconds !== null
        ? `${formatEta(downloadEtaSeconds)} remaining`
        : 'Estimating time remaining…'
      : 'Rendering time varies by presentation';

  return (
    <div
      className="dp-loading-overlay absolute inset-0 z-10 grid place-items-center px-6 backdrop-blur-sm"
      aria-label="Loading presentation preview"
      role="status"
      aria-live="polite"
    >
      <div className="dp-loading-card w-full max-w-md rounded-2xl border p-5 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[color:var(--dp-navy)]">
              Preparing presentation preview
            </p>
            <p className="mt-1 text-xs text-slate-500">{status}</p>
          </div>
          <span className="text-sm font-semibold text-[color:var(--dp-navy)]">
            {badge}
          </span>
        </div>
        <div
          className="dp-loading-track mt-4 h-2 overflow-hidden rounded-full"
          role={downloadPercent === null ? undefined : 'progressbar'}
          aria-label={
            downloadPercent === null
              ? undefined
              : 'Presentation download progress'
          }
          aria-valuemin={downloadPercent === null ? undefined : 0}
          aria-valuemax={downloadPercent === null ? undefined : 100}
          aria-valuenow={downloadPercent ?? undefined}
        >
          {downloadPercent !== null ? (
            <div
              className="dp-loading-bar h-full rounded-full transition-[width] duration-150"
              style={{ width: `${downloadPercent}%` }}
            />
          ) : (
            <div className="dp-loading-bar h-full w-2/5 animate-pulse rounded-full" />
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>
            {downloadTotal
              ? `Total size: ${formatBytes(downloadTotal)}`
              : 'Total size: calculating…'}
          </span>
          <span>{etaLabel}</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {phase === 'download'
            ? 'Download progress reflects the actual presentation bytes received.'
            : 'Slide rendering does not expose a percentage, so the live slide count is shown instead.'}
        </p>
      </div>
    </div>
  );
}

function PresentationFallbackPanel({
  fileId,
  onRetry,
}: {
  fileId: string;
  onRetry: () => void;
}) {
  return (
    <section
      role="alert"
      className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"
    >
      <h2 className="text-base font-semibold">
        Presentation preview could not be displayed
      </h2>
      <p className="mt-2">
        The presentation is still available to download. You can retry the
        preview without reloading the website.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-[color:var(--dp-navy)] px-3 py-2 font-medium text-white"
        >
          Retry preview
        </button>
        <a
          className="rounded-md border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950"
          href={`/api/files/${fileId}/download`}
        >
          Download presentation
        </a>
      </div>
    </section>
  );
}

function revokeObjectUrls(urls: string[]) {
  for (const url of urls) URL.revokeObjectURL(url);
}

function removeRendererTextArtifacts(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('span').forEach((span) => {
    if (span.textContent?.trim() === 'undefined') span.remove();
  });

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue?.trim() === 'undefined') node.nodeValue = '';
    node = walker.nextNode();
  }
}

function showOnlyActiveSlide(slides: HTMLElement[], activePage: number) {
  slides.forEach((slide, index) => {
    const active = index + 1 === activePage;
    slide.style.display = active ? '' : 'none';
    slide.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
}

function responseTotalBytes(response: Response) {
  const explicitFileSize = Number(response.headers.get('x-file-size'));
  if (Number.isFinite(explicitFileSize) && explicitFileSize > 0)
    return explicitFileSize;

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 0) return contentLength;

  const contentRangeTotal = Number(
    response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1],
  );
  return Number.isFinite(contentRangeTotal) && contentRangeTotal > 0
    ? contentRangeTotal
    : null;
}

async function readResponseWithProgress(
  response: Response,
  onProgress: (
    loaded: number,
    total: number | null,
    etaSeconds: number | null,
  ) => void,
) {
  const total = responseTotalBytes(response);

  onProgress(0, total, null);

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress(buffer.byteLength, total ?? buffer.byteLength, 0);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const startedAt = Date.now();
  let loaded = 0;
  let lastSampleAt = startedAt;
  let lastSampleLoaded = 0;
  let lastUpdateAt = 0;
  let smoothedBytesPerSecond = 0;

  const reportProgress = (force = false) => {
    const now = Date.now();
    const sampleSeconds = (now - lastSampleAt) / 1000;
    if (sampleSeconds >= 0.25) {
      const instantBytesPerSecond = (loaded - lastSampleLoaded) / sampleSeconds;
      if (instantBytesPerSecond > 0) {
        smoothedBytesPerSecond =
          smoothedBytesPerSecond > 0
            ? smoothedBytesPerSecond * 0.7 + instantBytesPerSecond * 0.3
            : instantBytesPerSecond;
      }
      lastSampleAt = now;
      lastSampleLoaded = loaded;
    }

    if (!force && now - lastUpdateAt < 100) return;
    const hasStableEstimate =
      total !== null && smoothedBytesPerSecond > 0 && now - startedAt >= 500;
    const etaSeconds =
      hasStableEstimate && loaded < total
        ? Math.max(1, Math.ceil((total - loaded) / smoothedBytesPerSecond))
        : loaded >= (total ?? Number.POSITIVE_INFINITY)
          ? 0
          : null;
    onProgress(loaded, total, etaSeconds);
    lastUpdateAt = now;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    reportProgress();
  }

  reportProgress(true);
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer as ArrayBuffer;
}

class PresentationErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('PPTX renderer crashed', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function PresentationViewer({
  url,
  fileId,
  name,
}: {
  url: string;
  fileId: string;
  name: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((current) => current + 1);
  return (
    <PresentationErrorBoundary
      key={attempt}
      fallback={<PresentationFallbackPanel fileId={fileId} onRetry={retry} />}
    >
      <PresentationViewerInner
        url={url}
        fileId={fileId}
        name={name}
        attempt={attempt}
        onRetry={retry}
      />
    </PresentationErrorBoundary>
  );
}

function PresentationViewerInner({
  url,
  fileId,
  name,
  attempt,
  onRetry,
}: {
  url: string;
  fileId: string;
  name: string;
  attempt: number;
  onRetry: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const activeSlideRef = useRef<HTMLButtonElement>(null);
  const slideNodes = useRef<HTMLElement[]>([]);
  const objectUrls = useRef<string[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('download');
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState<number | null>(null);
  const [downloadEtaSeconds, setDownloadEtaSeconds] = useState<number | null>(
    null,
  );
  const [renderedSlides, setRenderedSlides] = useState(0);
  const [audioBySlide, setAudioBySlide] = useState<AudioBySlide>({});

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let downloadTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let audioTimer: ReturnType<typeof setTimeout> | undefined;
    let renderObserver: MutationObserver | undefined;
    let mountedApp: any = null;
    let attemptUrls: string[] = [];

    revokeObjectUrls(objectUrls.current);
    objectUrls.current = [];
    setLoading(true);
    setFailed(false);
    setLoadingPhase('download');
    setDownloadedBytes(0);
    setDownloadTotal(null);
    setDownloadEtaSeconds(null);
    setRenderedSlides(0);
    setPages(0);
    setPage(1);
    setAudioBySlide({});
    slideNodes.current = [];
    root.current?.replaceChildren();

    const clearTimers = () => {
      if (downloadTimer) clearTimeout(downloadTimer);
      if (watchdog) clearTimeout(watchdog);
      if (audioTimer) clearTimeout(audioTimer);
      downloadTimer = undefined;
      watchdog = undefined;
      audioTimer = undefined;
    };

    const disposeRenderer = () => {
      renderObserver?.disconnect();
      renderObserver = undefined;
      if (mountedApp) {
        try {
          mountedApp.unmount();
        } catch (error) {
          console.warn('PPTX renderer cleanup failed', error);
        }
        mountedApp = null;
      }
      slideNodes.current = [];
      root.current?.replaceChildren();
    };

    const disposeAttempt = () => {
      controller.abort();
      clearTimers();
      disposeRenderer();
      revokeObjectUrls(attemptUrls);
      attemptUrls = [];
      objectUrls.current = [];
    };

    const failAttempt = (message: string, error?: unknown) => {
      if (stopped) return;
      stopped = true;
      if (error) console.error(message, error);
      disposeAttempt();
      setLoading(false);
      setFailed(true);
    };

    const rendererModulesPromise = Promise.all([
      import('@vue-office/pptx'),
      import('vue'),
      import('dompurify'),
    ]);

    const scheduleAudioExtraction = (buffer: ArrayBuffer) => {
      audioTimer = setTimeout(() => {
        void import('@/lib/pptx-audio')
          .then(({ extractPptxAudioBlobs }) => extractPptxAudioBlobs(buffer))
          .then((audioBlobs) => {
            if (stopped) return;
            const createdUrls: string[] = [];
            const mapped: AudioBySlide = {};
            for (const [slide, items] of Object.entries(audioBlobs)) {
              mapped[Number(slide)] = items.map((item) => {
                const audioUrl = URL.createObjectURL(item.blob);
                createdUrls.push(audioUrl);
                return { name: item.name, url: audioUrl };
              });
            }
            if (stopped) {
              revokeObjectUrls(createdUrls);
              return;
            }
            revokeObjectUrls(attemptUrls);
            attemptUrls = createdUrls;
            objectUrls.current = createdUrls;
            setAudioBySlide(mapped);
          })
          .catch((error) =>
            console.warn('PPTX audio extraction failed', error),
          );
      }, 500);
    };

    (async () => {
      try {
        downloadTimer = setTimeout(() => controller.abort(), 60_000);
        const response = await fetch(url, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`Presentation download failed (${response.status})`);
        const buffer = await readResponseWithProgress(
          response,
          (loaded, total, etaSeconds) => {
            if (stopped) return;
            setDownloadedBytes(loaded);
            setDownloadTotal(total);
            setDownloadEtaSeconds(etaSeconds);
          },
        );
        if (stopped) return;
        if (downloadTimer) clearTimeout(downloadTimer);
        downloadTimer = undefined;
        setDownloadEtaSeconds(null);
        setLoadingPhase('render');

        const [{ default: VueOfficePptx }, { createApp }, DOMPurify] =
          await rendererModulesPromise;
        if (stopped || !root.current) return;

        const mount = document.createElement('div');
        root.current.replaceChildren(mount);
        renderObserver = new MutationObserver(() => {
          if (stopped || !root.current) return;
          setRenderedSlides(
            root.current.querySelectorAll('.pptx-preview-slide-wrapper').length,
          );
        });
        renderObserver.observe(mount, { childList: true, subtree: true });

        watchdog = setTimeout(
          () => failAttempt('Presentation rendering timed out.'),
          30_000,
        );
        mountedApp = createApp(VueOfficePptx as any, {
          src: buffer,
          options: {
            width: Math.min(
              1100,
              Math.max(320, root.current.getBoundingClientRect().width - 32),
            ),
            height: Math.max(
              240,
              root.current.getBoundingClientRect().height - 32,
            ),
          },
          onRendered: () => {
            if (stopped || !root.current) return;
            try {
              renderObserver?.disconnect();
              renderObserver = undefined;
              DOMPurify.default.sanitize(root.current, {
                IN_PLACE: true,
                ADD_ATTR: ['target'],
              });
              removeRendererTextArtifacts(root.current);
              root.current.querySelectorAll('a').forEach((anchor) => {
                anchor.setAttribute('target', '_blank');
                anchor.setAttribute('rel', 'noopener noreferrer');
              });
              const nodes = Array.from(
                root.current.querySelectorAll<HTMLElement>(
                  '.pptx-preview-slide-wrapper',
                ),
              );
              if (nodes.length === 0) {
                queueMicrotask(() =>
                  failAttempt(
                    'Presentation renderer produced no slides.',
                    new Error('No PPTX slide nodes were found'),
                  ),
                );
                return;
              }
              slideNodes.current = nodes;
              showOnlyActiveSlide(nodes, 1);
              setRenderedSlides(nodes.length);
              setPages(nodes.length);
              setLoading(false);
              if (watchdog) clearTimeout(watchdog);
              watchdog = undefined;
              scheduleAudioExtraction(buffer);
            } catch (error) {
              queueMicrotask(() =>
                failAttempt('Presentation post-processing failed.', error),
              );
            }
          },
          onError: (error: unknown) => {
            queueMicrotask(() =>
              failAttempt('PPTX browser render failed.', error),
            );
          },
        });
        mountedApp.mount(mount);
      } catch (error) {
        failAttempt(
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Presentation download timed out.'
            : 'PPTX preview failed.',
          error,
        );
      }
    })();

    return () => {
      stopped = true;
      disposeAttempt();
    };
  }, [url, attempt]);

  useEffect(() => {
    showOnlyActiveSlide(slideNodes.current, page);
    stage.current?.scrollTo({ top: 0, left: 0 });
    activeSlideRef.current?.scrollIntoView({ block: 'nearest' });
  }, [page, pages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft')
        setPage((current) => Math.max(1, current - 1));
      if (event.key === 'ArrowRight')
        setPage((current) => Math.min(pages || 1, current + 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pages]);

  if (failed)
    return <PresentationFallbackPanel fileId={fileId} onRetry={onRetry} />;

  const audios = audioBySlide[page] || [];
  return (
    <section
      ref={wrap}
      className="flex h-[min(78dvh,calc(100dvh-9rem))] min-h-[520px] flex-col overflow-hidden bg-slate-100"
    >
      <header className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          aria-label="Previous slide"
          className="rounded border px-2 py-1 disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm text-slate-600">
          Slide {page} of {pages || '…'}
        </span>
        <button
          type="button"
          disabled={!pages || page >= pages}
          onClick={() => setPage((current) => Math.min(pages, current + 1))}
          aria-label="Next slide"
          className="rounded border px-2 py-1 disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
        <a
          className="rounded border px-2 py-1 text-sm"
          href={`/api/files/${fileId}/download`}
        >
          Download
        </a>
        <button
          type="button"
          onClick={() => wrap.current?.requestFullscreen?.()}
          className="ml-auto inline-flex items-center gap-2 rounded border px-2 py-1 text-sm"
        >
          <Expand className="size-4" />
          Full screen
        </button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)] overflow-hidden">
        <aside
          aria-label="Slide picker"
          className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-2"
        >
          {Array.from({ length: pages || 1 }, (_, index) => index + 1).map(
            (slide) => (
              <button
                ref={slide === page ? activeSlideRef : null}
                type="button"
                key={slide}
                disabled={!pages}
                onClick={() => setPage(slide)}
                className={`mb-2 w-full rounded border p-2 text-xs ${slide === page ? 'border-amber-300 bg-amber-50 text-[color:var(--dp-navy)]' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                Slide {slide}
              </button>
            ),
          )}
        </aside>
        <div
          ref={stage}
          className="relative min-h-0 overflow-auto bg-slate-200 p-4"
        >
          {loading && (
            <PresentationLoadingOverlay
              phase={loadingPhase}
              downloadedBytes={downloadedBytes}
              downloadTotal={downloadTotal}
              downloadEtaSeconds={downloadEtaSeconds}
              renderedSlides={renderedSlides}
            />
          )}
          <div
            ref={root}
            aria-label={name}
            className="mx-auto min-h-full max-w-full [&_.pptx-preview-wrapper]:!max-w-full"
          />
          {audios.length > 0 && (
            <div className="sticky bottom-3 mx-auto mt-3 max-w-3xl rounded-lg border border-slate-200 bg-white/95 p-3 shadow">
              <p className="mb-2 text-xs font-semibold text-slate-600">
                Embedded audio for slide {page}
              </p>
              {audios.map((audio) => (
                <audio
                  key={audio.url}
                  controls
                  preload="metadata"
                  src={audio.url}
                  aria-label={audio.name}
                  className="mb-2 w-full last:mb-0"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';

type SlideAudio = { name: string; url: string };
type AudioBySlide = Record<number, SlideAudio[]>;

function PresentationLoadingOverlay({ progress, status, pages }: { progress: number; status: string; pages: number }) {
  return <div className="absolute inset-0 z-10 grid place-items-center bg-slate-200/90 px-6 backdrop-blur-sm" aria-label="Loading presentation preview"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[color:var(--dp-navy)]">Preparing presentation preview</p><p className="mt-1 text-xs text-slate-500">{status}</p></div><span className="text-sm font-semibold text-[color:var(--dp-navy)]">{Math.round(progress)}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[color:var(--dp-blue)] transition-all duration-500" style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }} /></div><p className="mt-3 text-xs leading-5 text-slate-500">{pages ? `Rendering slide view for ${pages} slide${pages === 1 ? '' : 's'}.` : 'Large PPTX files can take a short moment to load.'}</p></div></div>;
}

function PresentationFallbackPanel({ fileId, onRetry }: { fileId: string; onRetry: () => void }) {
  return <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="text-base font-semibold">Presentation preview could not be displayed</h2><p className="mt-2">The presentation is still available to download. You can retry the preview without reloading the website.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={onRetry} className="rounded-md bg-[color:var(--dp-navy)] px-3 py-2 font-medium text-white">Retry preview</button><a className="rounded-md border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950" href={`/api/files/${fileId}/download`}>Download presentation</a></div></section>;
}

function revokeObjectUrls(urls: string[]) {
  for (const url of urls) URL.revokeObjectURL(url);
}

class PresentationErrorBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('PPTX renderer crashed', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PresentationViewer({ url, fileId, name }: { url: string; fileId: string; name: string }) {
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((current) => current + 1);
  return <PresentationErrorBoundary key={attempt} fallback={<PresentationFallbackPanel fileId={fileId} onRetry={retry} />}><PresentationViewerInner url={url} fileId={fileId} name={name} attempt={attempt} onRetry={retry} /></PresentationErrorBoundary>;
}

function PresentationViewerInner({ url, fileId, name, attempt, onRetry }: { url: string; fileId: string; name: string; attempt: number; onRetry: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const activeSlideRef = useRef<HTMLButtonElement>(null);
  const vueApp = useRef<any>(null);
  const slideNodes = useRef<HTMLElement[]>([]);
  const objectUrls = useRef<string[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Downloading presentation…');
  const [audioBySlide, setAudioBySlide] = useState<AudioBySlide>({});

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let downloadTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let mountedApp: any = null;
    let attemptUrls: string[] = [];

    revokeObjectUrls(objectUrls.current);
    objectUrls.current = [];
    setLoading(true);
    setFailed(false);
    setStatus('Downloading presentation…');
    setPages(0);
    setPage(1);
    setAudioBySlide({});
    slideNodes.current = [];
    root.current?.replaceChildren();

    const clearTimers = () => {
      if (downloadTimer) clearTimeout(downloadTimer);
      if (watchdog) clearTimeout(watchdog);
      downloadTimer = undefined;
      watchdog = undefined;
    };

    const disposeRenderer = () => {
      if (mountedApp) {
        try { mountedApp.unmount(); } catch (error) { console.warn('PPTX renderer cleanup failed', error); }
        mountedApp = null;
      }
      vueApp.current = null;
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
      setStatus(message);
      setLoading(false);
      setFailed(true);
    };

    (async () => {
      try {
        downloadTimer = setTimeout(() => controller.abort(), 60_000);
        const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error(`Presentation download failed (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (stopped) return;
        if (downloadTimer) clearTimeout(downloadTimer);
        downloadTimer = undefined;

        void import('@/lib/pptx-audio').then(({ extractPptxAudioBlobs }) => extractPptxAudioBlobs(buffer)).then((audioBlobs) => {
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
        }).catch((error) => console.warn('PPTX audio extraction failed', error));

        setStatus('Rendering slides in your browser…');
        watchdog = setTimeout(() => failAttempt('Presentation rendering timed out.'), 30_000);
        const [{ default: VueOfficePptx }, { createApp }, DOMPurify] = await Promise.all([
          import('@vue-office/pptx'),
          import('vue'),
          import('dompurify'),
        ]);
        if (stopped || !root.current) return;

        const mount = document.createElement('div');
        root.current.replaceChildren(mount);
        mountedApp = createApp(VueOfficePptx as any, {
          src: buffer,
          options: {
            width: Math.min(1100, Math.max(320, root.current.getBoundingClientRect().width - 32)),
            height: Math.max(240, root.current.getBoundingClientRect().height - 32),
          },
          onRendered: () => {
            if (stopped || !root.current) return;
            try {
              DOMPurify.default.sanitize(root.current, { IN_PLACE: true, ADD_ATTR: ['target'] });
              root.current.querySelectorAll('a').forEach((anchor) => {
                anchor.setAttribute('target', '_blank');
                anchor.setAttribute('rel', 'noopener noreferrer');
              });
              const nodes = Array.from(root.current.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper'));
              if (nodes.length === 0) {
                queueMicrotask(() => failAttempt('Presentation renderer produced no slides.', new Error('No PPTX slide nodes were found')));
                return;
              }
              slideNodes.current = nodes;
              setPages(nodes.length);
              setLoading(false);
              if (watchdog) clearTimeout(watchdog);
              watchdog = undefined;
            } catch (error) {
              queueMicrotask(() => failAttempt('Presentation post-processing failed.', error));
            }
          },
          onError: (error: unknown) => {
            queueMicrotask(() => failAttempt('PPTX browser render failed.', error));
          },
        });
        vueApp.current = mountedApp;
        mountedApp.mount(mount);
      } catch (error) {
        failAttempt(error instanceof DOMException && error.name === 'AbortError' ? 'Presentation download timed out.' : 'PPTX preview failed.', error);
      }
    })();

    return () => {
      stopped = true;
      disposeAttempt();
    };
  }, [url, attempt]);

  useEffect(() => {
    slideNodes.current.forEach((node, index) => {
      node.style.display = Math.abs(index + 1 - page) <= 1 ? '' : 'none';
    });
    activeSlideRef.current?.scrollIntoView({ block: 'nearest' });
  }, [page, pages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') setPage((current) => Math.max(1, current - 1));
      if (event.key === 'ArrowRight') setPage((current) => Math.min(pages || 1, current + 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pages]);

  if (failed) return <PresentationFallbackPanel fileId={fileId} onRetry={onRetry} />;

  const audios = audioBySlide[page] || [];
  return <section ref={wrap} className="flex h-[min(78dvh,calc(100dvh-9rem))] min-h-[520px] flex-col overflow-hidden bg-slate-100"><header className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Previous slide" className="rounded border px-2 py-1 disabled:opacity-40"><ChevronLeft className="size-4" /></button><span className="text-sm text-slate-600">Slide {page} of {pages || '…'}</span><button type="button" disabled={!pages || page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))} aria-label="Next slide" className="rounded border px-2 py-1 disabled:opacity-40"><ChevronRight className="size-4" /></button><a className="rounded border px-2 py-1 text-sm" href={`/api/files/${fileId}/download`}>Download</a><button type="button" onClick={() => wrap.current?.requestFullscreen?.()} className="ml-auto inline-flex items-center gap-2 rounded border px-2 py-1 text-sm"><Expand className="size-4" />Full screen</button></header><div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)] overflow-hidden"><aside aria-label="Slide picker" className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-2">{Array.from({ length: pages || 1 }, (_, index) => index + 1).map((slide) => <button ref={slide === page ? activeSlideRef : null} type="button" key={slide} disabled={!pages} onClick={() => setPage(slide)} className={`mb-2 w-full rounded border p-2 text-xs ${slide === page ? 'border-amber-300 bg-amber-50 text-[color:var(--dp-navy)]' : 'border-slate-200 hover:bg-slate-50'}`}>Slide {slide}</button>)}</aside><div className="relative min-h-0 overflow-auto bg-slate-200 p-4">{loading && <PresentationLoadingOverlay progress={pages ? 100 : 45} status={status} pages={pages} />}<div ref={root} aria-label={name} className="mx-auto min-h-full max-w-full [&_.pptx-preview-wrapper]:!max-w-full" />{audios.length > 0 && <div className="sticky bottom-3 mx-auto mt-3 max-w-3xl rounded-lg border border-slate-200 bg-white/95 p-3 shadow"><p className="mb-2 text-xs font-semibold text-slate-600">Embedded audio for slide {page}</p>{audios.map((audio) => <audio key={audio.url} controls preload="metadata" src={audio.url} aria-label={audio.name} className="mb-2 w-full last:mb-0" />)}</div>}</div></div></section>;
}

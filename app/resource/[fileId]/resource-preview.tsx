'use client';
import dynamic from 'next/dynamic';
import React, { memo, useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { ChevronLeft, ChevronRight, Expand, ZoomIn, ZoomOut } from 'lucide-react';
import { getResourceCapability } from '@/lib/resource-capabilities';

const WorkbookPreview = dynamic(() => import('./xlsx-preview').then(m => m.WorkbookPreview), { ssr: false, loading: () => <PreviewLoading /> });

function PreviewLoading() {
  return <div className="grid min-h-64 place-items-center border border-slate-200 bg-white" aria-label="Loading preview"><div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-[color:var(--dp-navy)]" /></div>;
}

function MediaPreview({ kind, url, fileId }: { kind: 'audio' | 'video'; url: string; name: string; fileId: string }) {
  const [error, setError] = useState(false);
  return <div className="rounded-md border border-slate-200 bg-white p-4">{!error ? kind === 'audio' ? <audio controls preload="metadata" src={url} onError={() => setError(true)} className="w-full" /> : <video controls preload="metadata" src={url} onError={() => setError(true)} className="max-h-[72vh] w-full rounded bg-black" /> : <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">This file could not be played here.</p><a className="mt-3 inline-flex rounded-md bg-[color:var(--dp-navy)] px-3 py-2 text-white" href={`/api/files/${fileId}/download`}>Download</a></div>}</div>;
}

function Unsupported({ fileId }: { mimeType: string; name: string; fileId: string }) {
  return <div className="rounded-md border border-slate-200 bg-white p-8 text-center"><h2 className="text-base font-semibold text-[color:var(--dp-navy)]">Preview unavailable</h2><a className="mt-4 inline-flex rounded-md bg-[color:var(--dp-navy)] px-3 py-2 text-sm font-medium text-white" href={`/api/files/${fileId}/download`}>Download</a></div>;
}

function ImagePreview({ url, name }: { url: string; name: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const fit = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const clamp = (v: { x: number; y: number }, z = zoom) => ({ x: Math.max(Math.min(v.x, 320 * z), -320 * z), y: Math.max(Math.min(v.y, 240 * z), -240 * z) });
  const setZoomSafe = (next: number) => setZoom(z => { const n = Math.max(1, Math.min(4, next)); if (n === 1) setPan({ x: 0, y: 0 }); else setPan(p => clamp(p, n)); return n; });
  return <div className="relative grid min-h-[70vh] touch-pan-y place-items-center overflow-hidden rounded-xl border border-slate-200 bg-[color:var(--dp-navy)] p-4 select-none"><div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-xl bg-[color:var(--dp-warm-surface)]/95 p-2 shadow"><button aria-label="Zoom out" onClick={() => setZoomSafe(zoom - .25)}><ZoomOut /></button><button aria-label="Fit image" onClick={fit} className="rounded px-2 text-sm font-medium">Fit</button><button aria-label="Zoom in" onClick={() => setZoomSafe(zoom + .25)}><ZoomIn /></button></div><img draggable={false} src={url} alt={name} onPointerDown={e => { if (zoom <= 1) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag({ id: e.pointerId, x: e.clientX, y: e.clientY, startX: pan.x, startY: pan.y }); }} onPointerMove={e => { if (!drag || drag.id !== e.pointerId) return; e.preventDefault(); setPan(clamp({ x: drag.startX + e.clientX - drag.x, y: drag.startY + e.clientY - drag.y })); }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? (drag ? 'grabbing' : 'grab') : 'default', touchAction: zoom > 1 ? 'none' : 'pan-y' }} className="max-h-[70vh] max-w-full object-contain transition-transform" /></div>;
}

export function ResourcePreview({ fileId, mimeType, name, sheetEmbedUrl }: { fileId: string; mimeType: string; name: string; sheetEmbedUrl?: string }) {
  const url = `/api/resource/${fileId}/content`;
  const cap = getResourceCapability(mimeType, name, false, fileId);
  if (cap.previewMode === 'pdf') return <PdfViewer url={url} fileId={fileId} name={name} />;
  if (cap.previewMode === 'image') return <ImagePreview url={url} name={name} />;
  if (cap.previewMode === 'master-xlsx') return <SpreadsheetPreview sheetEmbedUrl={sheetEmbedUrl} />;
  if (cap.previewMode === 'xlsx') return <WorkbookPreview url={url} name={name} />;
  if (cap.previewMode === 'audio') return <MediaPreview kind="audio" url={url} name={name} fileId={fileId} />;
  if (cap.previewMode === 'video') return <MediaPreview kind="video" url={url} name={name} fileId={fileId} />;
  if (cap.previewMode === 'text') return mimeType.includes('csv') || name.match(/\.csv$/i) ? <CsvTable url={url} /> : <TextPreview url={url} />;
  if (cap.previewMode === 'docx') return <DocxPreview url={url} />;
  if (cap.previewMode === 'pptx') return <PresentationViewer url={url} fileId={fileId} name={name} />;
  return <Unsupported mimeType={mimeType} name={name} fileId={fileId} />;
}

function SpreadsheetPreview({ sheetEmbedUrl }: { sheetEmbedUrl?: string }) {
  return sheetEmbedUrl ? <GoogleSheetsEmbed url={sheetEmbedUrl} /> : <SpreadsheetUnavailable />;
}

function SpreadsheetUnavailable() {
  return <section className="border-y border-slate-200 bg-white p-8 text-center text-sm text-slate-700"><h2 className="text-base font-semibold text-[color:var(--dp-navy)]">Preview unavailable</h2><p className="mt-1">Download remains available.</p></section>;
}

function GoogleSheetsEmbed({ url }: { url: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  return <section ref={wrap} className="flex h-[calc(100vh-190px)] min-h-[70vh] flex-col overflow-hidden border-y border-slate-200 bg-white"><header className="flex justify-end border-b border-slate-200 bg-[color:var(--dp-warm-surface)] px-3 py-2"><button type="button" onClick={() => wrap.current?.requestFullscreen?.()} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Expand className="size-4" />Full screen</button></header><iframe title="Google Sheets preview" src={url} className="min-h-0 flex-1 w-full bg-white" /></section>;
}

function CsvTable({ url }: { url: string }) {
  const [text, setText] = useState('');
  useEffect(() => { fetch(url).then(r => r.text()).then(setText).catch(() => setText('Preview failed')); }, [url]);
  const rows = text.split(/\r?\n/).slice(0, 200).map(r => r.split(','));
  return <div className="overflow-auto border-y border-slate-200 bg-white"><table className="text-sm"><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b border-r px-2 py-1">{c}</td>)}</tr>)}</tbody></table></div>;
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState('');
  useEffect(() => { fetch(url).then(r => r.text()).then(setText).catch(() => setText('Preview failed')); }, [url]);
  return <pre className="max-h-[72vh] overflow-auto border-y border-slate-200 bg-white p-4 text-sm whitespace-pre-wrap">{text}</pre>;
}

const DocxPreview = memo(function DocxPreview({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const container = ref.current;
    if (container) container.innerHTML = '';
    (async () => {
      try {
        setLoading(true); setError('');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Document preview failed');
        const buffer = await res.arrayBuffer();
        if (cancelled || !ref.current) return;
        await renderAsync(buffer, ref.current, undefined, { className: 'dp-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Document preview failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);
  return <section className="min-h-[75vh] overflow-auto border-y border-slate-200 bg-slate-100 p-4">{loading && <div className="mx-auto max-w-5xl space-y-3" aria-label="Loading Word document preview"><div className="h-6 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-[68vh] animate-pulse rounded bg-white shadow-sm" /></div>}{error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div ref={ref} className="mx-auto max-w-5xl [&_.docx-wrapper]:bg-slate-100 [&_.docx-wrapper]:p-0 [&_.docx]:shadow-sm" /></section>;
});


function PresentationLoadingOverlay({ progress, status, pages }: { progress: number; status: string; pages: number }) {
  return <div className="absolute inset-0 z-10 grid place-items-center bg-slate-200/90 px-6 backdrop-blur-sm" aria-label="Loading presentation preview"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[color:var(--dp-navy)]">Preparing presentation preview</p><p className="mt-1 text-xs text-slate-500">{status}</p></div><span className="text-sm font-semibold text-[color:var(--dp-navy)]">{Math.round(progress)}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[color:var(--dp-blue)] transition-all duration-500" style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }} /></div><p className="mt-3 text-xs leading-5 text-slate-500">{pages ? `Rendering slide view for ${pages} slide${pages === 1 ? '' : 's'}.` : 'Large PPTX files can take a short moment to load.'}</p></div></div>;
}

function PresentationFallbackPanel({ fileId, onRetry }: { fileId: string; onRetry: () => void }) {
  return <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="text-base font-semibold">Presentation preview could not be displayed</h2><p className="mt-2">The presentation is still available to download. You can retry the preview without reloading the website.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={onRetry} className="rounded-md bg-[color:var(--dp-navy)] px-3 py-2 font-medium text-white">Retry preview</button><a className="rounded-md border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950" href={`/api/files/${fileId}/download`}>Download presentation</a></div></section>;
}

type SlideAudio = { name: string; url: string };

type AudioBySlide = Record<number, SlideAudio[]>;

function escapeXmlAttr(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function extractPptxAudio(buffer: ArrayBuffer): Promise<AudioBySlide> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const bySlide: AudioBySlide = {};
  const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));
  await Promise.all(slideFiles.map(async slidePath => {
    const slideNumber = Number(slidePath.match(/slide(\d+)\.xml$/i)?.[1] || 0);
    if (!slideNumber) return;
    const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const relsFile = zip.file(relsPath);
    const slideFile = zip.file(slidePath);
    if (!relsFile || !slideFile) return;
    const [relsXml, slideXml] = await Promise.all([relsFile.async('text'), slideFile.async('text')]);
    const relationships = Array.from(relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*(?:Type="([^"]*)")?[^>]*>/gi));
    for (const match of relationships) {
      const [, id, rawTarget, type = ''] = match;
      if (!/audio|media/i.test(type) && !/\.(mp3|m4a|wav|aac|ogg)$/i.test(rawTarget)) continue;
      if (!new RegExp(`r:embed=["']${escapeXmlAttr(id)}["']|r:link=["']${escapeXmlAttr(id)}["']`).test(slideXml)) continue;
      const normalized = rawTarget.startsWith('/') ? rawTarget.slice(1) : `ppt/slides/${rawTarget}`;
      const mediaPath = normalized.replace(/ppt\/slides\/\.\.\//g, 'ppt/').replace(/\/\.\//g, '/');
      const media = zip.file(mediaPath);
      if (!media) continue;
      const blob = await media.async('blob');
      const url = URL.createObjectURL(blob);
      (bySlide[slideNumber] ||= []).push({ name: mediaPath.split('/').pop() || `Slide ${slideNumber} audio`, url });
    }
  }));
  return bySlide;
}

class PresentationErrorBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('PPTX renderer crashed', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function PresentationViewer({ url, fileId, name }: { url: string; fileId: string; name: string }) {
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt(a => a + 1);
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
    let cancelled = false;
    let downloadTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    objectUrls.current.forEach(URL.revokeObjectURL); objectUrls.current = [];
    setLoading(true); setFailed(false); setStatus('Downloading presentation…'); setPages(0); setPage(1); setAudioBySlide({});
    if (root.current) root.current.innerHTML = '';
    (async () => {
      try {
        downloadTimer = setTimeout(() => controller.abort(), 60_000);
        const res = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
        if (!res.ok) throw new Error('Presentation download failed');
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        if (downloadTimer) clearTimeout(downloadTimer);
        extractPptxAudio(buffer).then(audio => { if (!cancelled) { objectUrls.current = Object.values(audio).flat().map(a => a.url); setAudioBySlide(audio); } }).catch(error => console.warn('PPTX audio extraction failed', error));
        setStatus('Rendering slides in your browser…');
        watchdog = setTimeout(() => { if (!cancelled) { setStatus('Still rendering…'); setFailed(true); } }, 30_000);
        const [{ default: VueOfficePptx }, { createApp }, DOMPurify] = await Promise.all([import('@vue-office/pptx'), import('vue'), import('dompurify')]);
        if (cancelled || !root.current) return;
        const mount = document.createElement('div');
        root.current.replaceChildren(mount);
        vueApp.current = createApp(VueOfficePptx as any, { src: buffer, options: { width: Math.min(1100, Math.max(720, root.current.getBoundingClientRect().width - 32)), height: Math.max(420, root.current.getBoundingClientRect().height - 32) }, onRendered: () => {
          if (cancelled || !root.current) return;
          DOMPurify.default.sanitize(root.current, { IN_PLACE: true, ADD_ATTR: ['target'] });
          root.current.querySelectorAll('a').forEach(a => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
          const nodes = Array.from(root.current.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper'));
          slideNodes.current = nodes;
          setPages(nodes.length);
          setLoading(false);
          if (watchdog) clearTimeout(watchdog);
        }, onError: (error: unknown) => { console.error('PPTX browser render failed', error); if (!cancelled) { setFailed(true); setLoading(false); } } });
        vueApp.current.mount(mount);
      } catch (error) {
        if (!cancelled) { console.error('PPTX preview failed', error); setFailed(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; controller.abort(); if (downloadTimer) clearTimeout(downloadTimer); if (watchdog) clearTimeout(watchdog); vueApp.current?.unmount?.(); vueApp.current = null; objectUrls.current.forEach(URL.revokeObjectURL); objectUrls.current = []; if (root.current) root.current.innerHTML = ''; };
  }, [url, attempt]);

  useEffect(() => {
    slideNodes.current.forEach((node, index) => { node.style.display = Math.abs(index + 1 - page) <= 1 ? '' : 'none'; });
    activeSlideRef.current?.scrollIntoView({ block: 'nearest' });
  }, [page, pages]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setPage(p => Math.max(1, p - 1)); if (e.key === 'ArrowRight') setPage(p => Math.min(pages || 1, p + 1)); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [pages]);

  if (failed) return <PresentationFallbackPanel fileId={fileId} onRetry={onRetry} />;
  const audios = audioBySlide[page] || [];
  return <section ref={wrap} className="flex h-[min(78dvh,calc(100dvh-9rem))] min-h-[520px] flex-col overflow-hidden bg-slate-100"><header className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2"><button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous slide" className="rounded border px-2 py-1 disabled:opacity-40"><ChevronLeft className="size-4" /></button><span className="text-sm text-slate-600">Slide {page} of {pages || '…'}</span><button type="button" disabled={!pages || page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))} aria-label="Next slide" className="rounded border px-2 py-1 disabled:opacity-40"><ChevronRight className="size-4" /></button><a className="rounded border px-2 py-1 text-sm" href={`/api/files/${fileId}/download`}>Download</a><button type="button" onClick={() => wrap.current?.requestFullscreen?.()} className="ml-auto inline-flex items-center gap-2 rounded border px-2 py-1 text-sm"><Expand className="size-4" />Full screen</button></header><div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)] overflow-hidden"><aside aria-label="Slide picker" className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-2">{Array.from({ length: pages || 1 }, (_, i) => i + 1).map(n => <button ref={n === page ? activeSlideRef : null} type="button" key={n} disabled={!pages} onClick={() => setPage(n)} className={`mb-2 w-full rounded border p-2 text-xs ${n === page ? 'border-amber-300 bg-amber-50 text-[color:var(--dp-navy)]' : 'border-slate-200 hover:bg-slate-50'}`}>Slide {n}</button>)}</aside><div className="relative min-h-0 overflow-auto bg-slate-200 p-4">{loading && <PresentationLoadingOverlay progress={pages ? 100 : 45} status={status} pages={pages} />}<div ref={root} aria-label={name} className="mx-auto min-h-full max-w-full [&_.pptx-preview-wrapper]:!max-w-full" />{audios.length > 0 && <div className="sticky bottom-3 mx-auto mt-3 max-w-3xl rounded-lg border border-slate-200 bg-white/95 p-3 shadow"><p className="mb-2 text-xs font-semibold text-slate-600">Embedded audio for slide {page}</p>{audios.map(audio => <audio key={audio.url} controls preload="metadata" src={audio.url} className="mb-2 w-full last:mb-0" />)}</div>}</div></div></section>;
}

function PdfViewer({ url, fileId, name }: { url: string; fileId: string; name: string }) {
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    (async () => {
      try {
        setLoading(true); setError('');
        const res = await fetch(url, { credentials: 'same-origin' });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.includes('pdf')) throw new Error('PDF preview failed');
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setError('PDF preview failed. You can still download the file.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  if (error) return <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">{error}</p><a className="mt-3 inline-flex rounded-md bg-[color:var(--dp-navy)] px-3 py-2 text-white" href={`/api/files/${fileId}/download`}>Download</a></div>;
  return <div className="relative min-h-[75vh] border-y border-slate-200 bg-white">{loading && <div className="absolute inset-0 grid place-items-center bg-white"><div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-[color:var(--dp-navy)]" aria-label="Loading PDF" /></div>}{blobUrl && <iframe title={name} src={blobUrl} className="h-[75vh] w-full bg-white" />}</div>;
}

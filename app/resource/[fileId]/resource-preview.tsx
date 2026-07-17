'use client';
import dynamic from 'next/dynamic';
import { memo, useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Expand, ZoomIn, ZoomOut } from 'lucide-react';
import { getResourceCapability } from '@/lib/resource-capabilities';
import { PdfViewer } from './pdf-viewer';
import { PresentationViewer } from './presentation-viewer';

const WorkbookPreview = dynamic(
  () => import('./xlsx-preview').then((m) => m.WorkbookPreview),
  { ssr: false, loading: () => <PreviewLoading /> },
);

function PreviewLoading() {
  return (
    <div
      className="dp-loading-card grid min-h-64 place-items-center border"
      aria-label="Loading preview"
      role="status"
    >
      <div className="dp-loading-spinner size-8 animate-spin rounded-full border-2" />
    </div>
  );
}

function MediaPreview({
  kind,
  url,
  fileId,
}: {
  kind: 'audio' | 'video';
  url: string;
  name: string;
  fileId: string;
}) {
  const [error, setError] = useState(false);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      {!error ? (
        kind === 'audio' ? (
          <audio
            controls
            preload="metadata"
            src={url}
            onError={() => setError(true)}
            className="w-full"
          />
        ) : (
          <video
            controls
            preload="metadata"
            src={url}
            onError={() => setError(true)}
            className="max-h-[72vh] w-full rounded bg-black"
          />
        )
      ) : (
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">This file could not be played here.</p>
          <a
            className="mt-3 inline-flex rounded-md bg-[color:var(--dp-navy)] px-3 py-2 text-white"
            href={`/api/files/${fileId}/download`}
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}

function Unsupported({
  fileId,
}: {
  mimeType: string;
  name: string;
  fileId: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-8 text-center">
      <h2 className="text-base font-semibold text-[color:var(--dp-navy)]">
        Preview unavailable
      </h2>
      <a
        className="mt-4 inline-flex rounded-md bg-[color:var(--dp-navy)] px-3 py-2 text-sm font-medium text-white"
        href={`/api/files/${fileId}/download`}
      >
        Download
      </a>
    </div>
  );
}

function ImagePreview({ url, name }: { url: string; name: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const fit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const clamp = (v: { x: number; y: number }, z = zoom) => ({
    x: Math.max(Math.min(v.x, 320 * z), -320 * z),
    y: Math.max(Math.min(v.y, 240 * z), -240 * z),
  });
  const setZoomSafe = (next: number) =>
    setZoom((z) => {
      const n = Math.max(1, Math.min(4, next));
      if (n === 1) setPan({ x: 0, y: 0 });
      else setPan((p) => clamp(p, n));
      return n;
    });
  return (
    <div className="relative grid min-h-[70vh] touch-pan-y place-items-center overflow-hidden rounded-xl border border-slate-200 bg-[color:var(--dp-navy)] p-4 select-none">
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-xl bg-[color:var(--dp-warm-surface)]/95 p-2 shadow">
        <button aria-label="Zoom out" onClick={() => setZoomSafe(zoom - 0.25)}>
          <ZoomOut />
        </button>
        <button
          aria-label="Fit image"
          onClick={fit}
          className="rounded px-2 text-sm font-medium"
        >
          Fit
        </button>
        <button aria-label="Zoom in" onClick={() => setZoomSafe(zoom + 0.25)}>
          <ZoomIn />
        </button>
      </div>
      <img
        draggable={false}
        src={url}
        alt={name}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            startX: pan.x,
            startY: pan.y,
          });
        }}
        onPointerMove={(e) => {
          if (!drag || drag.id !== e.pointerId) return;
          e.preventDefault();
          setPan(
            clamp({
              x: drag.startX + e.clientX - drag.x,
              y: drag.startY + e.clientY - drag.y,
            }),
          );
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          cursor: zoom > 1 ? (drag ? 'grabbing' : 'grab') : 'default',
          touchAction: zoom > 1 ? 'none' : 'pan-y',
        }}
        className="max-h-[70vh] max-w-full object-contain transition-transform"
      />
    </div>
  );
}

export function ResourcePreview({
  fileId,
  mimeType,
  name,
  sheetEmbedUrl,
}: {
  fileId: string;
  mimeType: string;
  name: string;
  sheetEmbedUrl?: string;
}) {
  const url = `/api/resource/${fileId}/content`;
  const cap = getResourceCapability(mimeType, name, false, fileId);
  if (cap.previewMode === 'pdf')
    return <PdfViewer url={url} fileId={fileId} name={name} />;
  if (cap.previewMode === 'image')
    return <ImagePreview url={url} name={name} />;
  if (cap.previewMode === 'master-xlsx')
    return <SpreadsheetPreview sheetEmbedUrl={sheetEmbedUrl} />;
  if (cap.previewMode === 'xlsx')
    return <WorkbookPreview url={url} name={name} />;
  if (cap.previewMode === 'audio')
    return <MediaPreview kind="audio" url={url} name={name} fileId={fileId} />;
  if (cap.previewMode === 'video')
    return <MediaPreview kind="video" url={url} name={name} fileId={fileId} />;
  if (cap.previewMode === 'text')
    return mimeType.includes('csv') || name.match(/\.csv$/i) ? (
      <CsvTable url={url} />
    ) : (
      <TextPreview url={url} />
    );
  if (cap.previewMode === 'docx') return <DocxPreview url={url} />;
  if (cap.previewMode === 'pptx')
    return <PresentationViewer url={url} fileId={fileId} name={name} />;
  return <Unsupported mimeType={mimeType} name={name} fileId={fileId} />;
}

function SpreadsheetPreview({ sheetEmbedUrl }: { sheetEmbedUrl?: string }) {
  return sheetEmbedUrl ? (
    <GoogleSheetsEmbed url={sheetEmbedUrl} />
  ) : (
    <SpreadsheetUnavailable />
  );
}

function SpreadsheetUnavailable() {
  return (
    <section className="border-y border-slate-200 bg-white p-8 text-center text-sm text-slate-700">
      <h2 className="text-base font-semibold text-[color:var(--dp-navy)]">
        Preview unavailable
      </h2>
      <p className="mt-1">Download remains available.</p>
    </section>
  );
}

function GoogleSheetsEmbed({ url }: { url: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  return (
    <section
      ref={wrap}
      className="flex h-[calc(100vh-190px)] min-h-[70vh] flex-col overflow-hidden border-y border-slate-200 bg-white"
    >
      <header className="flex justify-end border-b border-slate-200 bg-[color:var(--dp-warm-surface)] px-3 py-2">
        <button
          type="button"
          onClick={() => wrap.current?.requestFullscreen?.()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Expand className="size-4" />
          Full screen
        </button>
      </header>
      <iframe
        title="Google Sheets preview"
        src={url}
        className="min-h-0 flex-1 w-full bg-white"
      />
    </section>
  );
}

function CsvTable({ url }: { url: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText('Preview failed'));
  }, [url]);
  const rows = text
    .split(/\r?\n/)
    .slice(0, 200)
    .map((r) => r.split(','));
  return (
    <div className="overflow-auto border-y border-slate-200 bg-white">
      <table className="text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border-b border-r px-2 py-1">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText('Preview failed'));
  }, [url]);
  return (
    <pre className="max-h-[72vh] overflow-auto border-y border-slate-200 bg-white p-4 text-sm whitespace-pre-wrap">
      {text}
    </pre>
  );
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
        setLoading(true);
        setError('');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Document preview failed');
        const buffer = await res.arrayBuffer();
        if (cancelled || !ref.current) return;
        await renderAsync(buffer, ref.current, undefined, {
          className: 'dp-docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Document preview failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <section className="min-h-[75vh] overflow-auto border-y border-slate-200 bg-slate-100 p-4">
      {loading && (
        <div
          className="mx-auto max-w-5xl space-y-3"
          aria-label="Loading Word document preview"
        >
          <div className="h-6 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="h-[68vh] animate-pulse rounded bg-white shadow-sm" />
        </div>
      )}
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div
        ref={ref}
        className="mx-auto max-w-5xl [&_.docx-wrapper]:bg-slate-100 [&_.docx-wrapper]:p-0 [&_.docx]:shadow-sm"
      />
    </section>
  );
});

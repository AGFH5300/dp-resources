'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, FileArchive, FileSpreadsheet, FileText, FileType, Folder, Presentation, Search } from 'lucide-react';
import type { DriveItem } from '@/lib/types';

type Props = { items: DriveItem[]; crumbs: DriveItem[]; rootId: string };

function hrefForFolder(id: string, rootId: string) {
  return id === rootId ? '/library' : `/library?folder=${encodeURIComponent(id)}`;
}

function typeLabel(mimeType: string) {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Presentation';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'Word document';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'Archive';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  return 'Resource file';
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const cls = 'size-5 text-slate-500';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet className={cls} />;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return <Presentation className={cls} />;
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return <FileArchive className={cls} />;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word')) return <FileText className={cls} />;
  return <FileType className={cls} />;
}

function formatSize(size?: string) {
  if (!size) return '—';
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function trackFolder(item: DriveItem) {
  const body = JSON.stringify({ folderId: item.id, folderName: item.name });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/library/open-folder', new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch('/api/library/open-folder', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined);
}

export function LibraryBrowser({ items, crumbs, rootId }: Props) {
  const [query, setQuery] = useState('');
  const active = crumbs.at(-1);
  const parent = crumbs.length > 1 ? crumbs.at(-2) : null;
  const filtered = useMemo(() => items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);
  const folders = filtered.filter((item) => item.isFolder);
  const files = filtered.filter((item) => !item.isFolder);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {crumbs.map((crumb, index) => (
            <span key={crumb.id} className="inline-flex items-center gap-2">
              {index > 0 ? <span className="text-slate-300">/</span> : null}
              <Link href={hrefForFolder(crumb.id, rootId)} className="font-medium text-slate-600 hover:text-slate-950">
                {index === 0 ? 'All resources' : crumb.name}
              </Link>
            </span>
          ))}
        </nav>
        {parent ? (
          <Link href={hrefForFolder(parent.id, rootId)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <ArrowLeft className="size-4" /> Back to {parent.id === rootId ? 'Library' : parent.name}
          </Link>
        ) : null}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{active?.name || 'Library'}</h1>
            <p className="mt-2 text-sm text-slate-500">{filtered.length} {filtered.length === 1 ? 'item' : 'items'} in this folder</p>
          </div>
          <label className="relative block w-full md:max-w-sm">
            <span className="mb-2 block text-sm font-medium text-slate-700">Search this folder</span>
            <Search className="pointer-events-none absolute bottom-3 left-3 size-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-700/10" placeholder="Search resources" />
          </label>
        </div>
      </div>

      {folders.length ? (
        <section aria-labelledby="folders-heading">
          <h2 id="folders-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Folders</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder) => (
              <Link prefetch key={folder.id} href={hrefForFolder(folder.id, rootId)} onClick={() => trackFolder(folder)} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-700/40 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-amber-700/10">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-800"><Folder className="size-5" /></span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">{folder.name}</p>
                    <p className="mt-1 text-sm text-slate-500 group-hover:text-amber-800">Open folder</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="files-heading">
        <h2 id="files-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Files</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {files.length ? files.map((file) => (
            <div key={file.id} className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100"><FileIcon mimeType={file.mimeType} /></span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">{file.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{typeLabel(file.mimeType)} · {formatSize(file.size)} · {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Modified date unavailable'}</p>
                </div>
              </div>
              <div className="flex gap-2 md:justify-end">
                <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={`/api/files/${file.id}/open`}><ExternalLink className="size-4" /> Open</Link>
                <Link className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800" href={`/api/files/${file.id}/download`}><Download className="size-4" /> Download</Link>
              </div>
            </div>
          )) : <p className="p-6 text-sm text-slate-500">No files match this view.</p>}
        </div>
      </section>
    </div>
  );
}

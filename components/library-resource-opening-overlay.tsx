'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { RecentResource } from '@/lib/recent-resources';
import { typeLabel } from '@/lib/resource-utils';

function folderNames(path: string, resourceName: string) {
  const parts = String(path || '')
    .split(' / ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts[0] === 'Library') parts.shift();
  if (parts.at(-1) === resourceName) parts.pop();
  return parts;
}

export function LibraryResourceOpeningOverlay() {
  const [opening, setOpening] = useState<RecentResource | null>(null);
  const suppressNextOpeningRef = useRef(false);

  useEffect(() => {
    let timeout: number | null = null;
    const noteModifiedClick = (event: MouseEvent) => {
      suppressNextOpeningRef.current =
        event.button === 1 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey;
    };
    const handleOpening = (event: Event) => {
      const resource = (event as CustomEvent<RecentResource>).detail;
      const suppressed = suppressNextOpeningRef.current;
      suppressNextOpeningRef.current = false;
      if (!resource || resource.isFolder || suppressed) return;
      if (timeout) window.clearTimeout(timeout);
      // This event fires synchronously before router.push(). Commit the visual
      // transition now so the click can never appear to hang while the RSC route
      // and preview authorization are starting in the background.
      flushSync(() => setOpening(resource));
      timeout = window.setTimeout(() => setOpening(null), 15_000);
    };

    document.addEventListener('click', noteModifiedClick, true);
    document.addEventListener('auxclick', noteModifiedClick, true);
    window.addEventListener('dp:resource-opening', handleOpening);
    return () => {
      document.removeEventListener('click', noteModifiedClick, true);
      document.removeEventListener('auxclick', noteModifiedClick, true);
      window.removeEventListener('dp:resource-opening', handleOpening);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  if (!opening) return null;
  const folders = folderNames(opening.path, opening.name);

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-16 z-30 overflow-y-auto bg-[color:var(--dp-warm-surface)] md:bottom-0"
      aria-busy="true"
      aria-label={`Opening ${opening.name}`}
    >
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-3 border-b border-slate-200 pb-3">
          <nav
            aria-label="Resource path"
            className="flex flex-wrap items-center gap-1 text-sm text-slate-500"
          >
            <Link
              href="/library"
              className="font-medium text-[color:var(--dp-blue)] hover:underline"
            >
              Library
            </Link>
            {folders.map((name, index) => (
              <span key={`${name}-${index}`} className="inline-flex items-center gap-1">
                <span>/</span>
                <span className="font-medium">{name}</span>
              </span>
            ))}
            <span>/</span>
            <span className="truncate font-medium text-slate-700">
              {opening.name}
            </span>
          </nav>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-[color:var(--dp-navy)]">
                {opening.name}
              </h1>
              <span className="mt-1 inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {typeLabel(opening.mimeType, false)}
              </span>
            </div>
            <div className="flex gap-2" aria-hidden="true">
              <div className="h-9 w-20 animate-pulse rounded-md bg-slate-200" />
              <div className="h-9 w-20 animate-pulse rounded-md bg-slate-200" />
            </div>
          </div>
        </div>

        <section className="relative min-h-[72vh] overflow-hidden border border-slate-200 bg-white">
          <div className="absolute inset-x-0 top-0 flex h-12 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3">
            <div className="h-7 w-7 animate-pulse rounded bg-slate-200" />
            <div className="h-7 w-7 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="grid min-h-[72vh] place-items-center px-6 pt-12">
            <div className="w-full max-w-3xl space-y-3">
              <div className="mx-auto h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="h-[58vh] animate-pulse rounded-md bg-slate-100" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

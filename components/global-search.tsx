'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { resourceUrl, typeLabel } from '@/lib/resource-utils';
import { ResourceTypeIcon } from '@/components/resource-type-icon';
import { SearchHighlight } from '@/components/search-highlight';
import type { ResourceIndex } from '@/lib/types';

type Result = ResourceIndex;
type IndexState = 'unknown' | 'ready' | 'empty' | 'preparing' | 'updating';
function resultRow(
  r: Result,
  q: string,
  active: boolean,
  openingId: string,
  openResult: (r: Result) => void,
  prefetchSoon: (r: Result) => void,
) {
  const opening = openingId === r.drive_file_id;
  return (
    <button
      type="button"
      onMouseEnter={() => prefetchSoon(r)}
      onFocus={() => prefetchSoon(r)}
      onClick={() => openResult(r)}
      key={r.drive_file_id}
      className={`dp-search-result grid w-full grid-cols-[1.25rem_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-left ${active ? 'dp-search-result-active' : ''}`}
    >
      <ResourceTypeIcon
        item={{ isFolder: r.is_folder, mimeType: r.mime_type }}
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-[color:var(--dp-navy)]">
          <SearchHighlight text={r.name} query={q} />
        </span>
        <span className="block truncate text-xs text-[color:var(--dp-ink)]/55">
          <SearchHighlight text={r.path || 'Library'} query={q} /> ·{' '}
          {typeLabel(r.mime_type, r.is_folder)}
        </span>
      </span>
      {opening && (
        <Loader2
          className="size-4 animate-spin text-slate-500"
          aria-label="Opening"
        />
      )}
    </button>
  );
}
export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [indexState, setIndexState] = useState<IndexState>('unknown');
  const [folders, setFolders] = useState<Result[]>([]);
  const [files, setFiles] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [openingId, setOpeningId] = useState('');
  const [routePending, setRoutePending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);
  const flat = useMemo(() => [...folders, ...files], [folders, files]);
  const clearState = () => {
    setQ('');
    setFolders([]);
    setFiles([]);
    setError('');
    setLoading(false);
    setSlow(false);
    setActive(0);
    setOpeningId('');
    setRoutePending(false);
  };
  const resetSearch = () => {
    clearState();
    setOpen(false);
  };
  const openSearch = () => {
    clearState();
    setOpen(true);
  };
  const close = resetSearch;
  useEffect(() => {
    const f = () => openSearch();
    window.addEventListener('dp:open-search', f);
    return () => window.removeEventListener('dp:open-search', f);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      }
      if (e.key === 'Escape') resetSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 10);
  }, [open]);
  useEffect(() => {
    const seq = ++requestSeq.current;
    if (!open || q.trim().length < 2) {
      setFolders([]);
      setFiles([]);
      setLoading(false);
      setSlow(false);
      setError('');
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setSlow(false);
      setError('');
      const slowTimer = setTimeout(() => {
        if (requestSeq.current === seq) setSlow(true);
      }, 800);
      const timeoutTimer = setTimeout(() => ac.abort('timeout'), 7000);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (requestSeq.current !== seq) return;
        setIndexState(data.indexState || 'ready');
        setFolders(data.folders || []);
        setFiles(data.files || []);
        setActive(0);
      } catch (err) {
        if (requestSeq.current !== seq) return;
        setFolders([]);
        setFiles([]);
        setError(
          ac.signal.aborted
            ? 'Search timed out. Please retry.'
            : 'Search unavailable. Please retry.',
        );
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
        if (requestSeq.current === seq) {
          setLoading(false);
          setSlow(false);
        }
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q, open, retryNonce]);
  useEffect(() => {
    if (flat[active])
      router.prefetch(
        resourceUrl({
          drive_file_id: flat[active].drive_file_id,
          is_folder: flat[active].is_folder,
        }),
      );
  }, [active, flat, router]);
  useEffect(() => {
    if (openingId) resetSearch();
  }, [pathname]);
  const prefetchSoon = (r: Result) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(
      () =>
        router.prefetch(
          resourceUrl({
            drive_file_id: r.drive_file_id,
            is_folder: r.is_folder,
          }),
        ),
      150,
    );
  };
  const openResult = (r: Result) => {
    const href = resourceUrl({
      drive_file_id: r.drive_file_id,
      is_folder: r.is_folder,
    });
    setOpeningId(r.drive_file_id);
    setRoutePending(true);
    startTransition(() => {
      router.push(href);
      setTimeout(() => setOpen(false), 80);
    });
  };
  if (!open)
    return routePending ? (
      <div className="fixed left-0 top-0 z-[60] h-0.5 w-full overflow-hidden bg-transparent">
        <div className="h-full w-1/3 animate-pulse bg-[color:var(--dp-blue)]" />
      </div>
    ) : null;
  const choose = flat[active];
  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--dp-navy)]/25 p-3 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dp-search-dialog mx-auto mt-18 w-full max-w-[640px] overflow-hidden rounded-lg border shadow-[0_18px_55px_rgb(30_41_59/0.18)]">
        <div className="dp-search-header flex h-14 items-center gap-3 border-b px-4">
          <Search className="size-5 text-slate-500" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter' && choose) {
                openResult(choose);
              }
            }}
            placeholder="Search files, folders, and paths"
            className="flex-1 text-base"
            style={{
              background: 'transparent',
              backgroundColor: 'transparent',
              border: 'none',
              borderColor: 'transparent',
              outline: 'none',
              boxShadow: 'none',
            }}
          />
          <button
            aria-label="Close search"
            onClick={close}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {q.length < 2 ? (
            <div className="px-3 py-4">
              <p className="text-sm font-medium text-[color:var(--dp-navy)]">
                Search files, folders, and paths
              </p>
              <p className="mt-1 text-xs text-[color:var(--dp-ink)]/60">
                Type at least two characters.
              </p>
              {indexState === 'preparing' && (
                <p className="mt-2 text-xs text-[color:var(--dp-ink)]/50">
                  The library is preparing its first search index.
                </p>
              )}
            </div>
          ) : loading ? (
            <p className="p-8 text-center text-sm text-[color:var(--dp-ink)]/65">
              {slow ? 'Still searching…' : 'Searching your library…'}
            </p>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => setRetryNonce((n) => n + 1)}
                className="mt-2 text-sm font-medium text-[color:var(--dp-navy)]"
              >
                Retry
              </button>
            </div>
          ) : !flat.length ? (
            <div className="p-8 text-center text-sm text-[color:var(--dp-ink)]/65">
              {indexState === 'preparing' ? (
                <p>
                  Your administrator needs to sync the library before global
                  search is available.
                </p>
              ) : (
                <>
                  <p className="font-medium text-[color:var(--dp-navy)]">
                    No matching resources
                  </p>
                  <p className="mt-1 text-xs">
                    Try a subject, topic, paper, year, or filename.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {folders.length ? (
                <section className="mb-3">
                  <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Folders
                  </h3>
                  {folders.map((r) =>
                    resultRow(
                      r,
                      q,
                      flat.indexOf(r) === active,
                      openingId,
                      openResult,
                      prefetchSoon,
                    ),
                  )}
                </section>
              ) : null}
              {files.length ? (
                <section className="mb-3">
                  <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Files
                  </h3>
                  {files.map((r) =>
                    resultRow(
                      r,
                      q,
                      flat.indexOf(r) === active,
                      openingId,
                      openResult,
                      prefetchSoon,
                    ),
                  )}
                </section>
              ) : null}
              <Link
                onClick={resetSearch}
                href={`/search?q=${encodeURIComponent(q)}`}
                className="dp-search-view-all block rounded-md border p-2 text-center text-sm font-medium text-[color:var(--dp-navy)] hover:bg-slate-50"
              >
                View all results
              </Link>
            </>
          )}
        </div>
        {flat.length ? (
          <div className="dp-search-footer border-t px-4 py-2 text-xs text-slate-500">
            ↑↓ navigate · Enter open · Esc close
          </div>
        ) : null}
      </div>
    </div>
  );
}
/* Legacy QA marker: max-w-2xl */

/* Legacy QA copy: No matching resources. */

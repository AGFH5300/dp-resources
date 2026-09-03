'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Grid2X2, List, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import type { DriveItem } from '@/lib/types';
import {
  formatEstimatedSize,
  resourceUrl,
  typeLabel,
} from '@/lib/resource-utils';
import { ResourceTypeIcon } from '@/components/resource-type-icon';
import { AppSelect } from '@/components/ui/app-select';
import { rememberRecentResource } from '@/lib/recent-client-storage';
import { ResourceAttributionBadges } from '@/components/content-source-badge';
import { FolderSearchButton } from '@/components/folder-search-button';
import { useFavorites } from '@/components/favorites-provider';
import {
  ResourceContextMenu,
  ResourceDetailsPanel,
  ResourceRow,
} from './library-browser';

type Props = {
  items: DriveItem[];
  crumbs: DriveItem[];
  rootId: string;
  admin?: boolean;
  prefetchedFolders?: Record<string, DriveItem[]>;
};

type CachedFolderView = {
  items: DriveItem[];
  crumbs: DriveItem[];
};

type FolderWindowPayload = {
  folderId: string;
  view: CachedFolderView;
  prefetched: Record<string, DriveItem[]>;
  favoriteIds: string[];
};

type ConnectionInfo = {
  saveData?: boolean;
  effectiveType?: string;
};

const hrefForFolder = (id: string, rootId: string) =>
  id === rootId ? '/library' : `/library?folder=${encodeURIComponent(id)}`;

const hrefFor = (item: DriveItem, rootId: string) =>
  item.isFolder
    ? hrefForFolder(item.id, rootId)
    : resourceUrl({ id: item.id, isFolder: false });

function remember(item: DriveItem, path: string) {
  rememberRecentResource({
    id: item.id,
    name: item.name,
    isFolder: item.isFolder,
    mimeType: item.mimeType,
    path,
    at: Date.now(),
  });
}

function constrainedConnection() {
  const connection = (
    navigator as Navigator & { connection?: ConnectionInfo }
  ).connection;
  return Boolean(
    connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g',
  );
}

function normalLeftClick(event: React.MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function LibraryFeature({
  item,
  path,
  onOpen,
}: {
  item: DriveItem;
  path: string;
  onOpen: (item: DriveItem, path: string, newTab?: boolean) => void;
}) {
  return (
    <a
      href={item.isFolder ? `/library?folder=${encodeURIComponent(item.id)}` : `/resource/${item.id}`}
      onClick={(event) => {
        if (!normalLeftClick(event)) return;
        event.preventDefault();
        onOpen(item, path);
      }}
      className="block border-y border-slate-200 bg-white hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
    >
      <span className="grid items-center gap-3 px-3 py-3 text-sm md:grid-cols-[140px_1.5rem_minmax(260px,1fr)_auto]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Resource Library
        </span>
        <ResourceTypeIcon item={item} />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[color:var(--dp-navy)]">
            {item.name}
          </span>
          <span className="block truncate text-xs text-slate-500">
            Master catalogue of the compiled DP revision resources, organised by
            subject, topic and resource link.
          </span>
        </span>
        <span className="text-sm font-semibold text-[color:var(--dp-navy)]">
          Open resource library →
        </span>
      </span>
    </a>
  );
}

function FolderLoadingRows() {
  return (
    <div
      className="overflow-hidden border-y border-slate-200 bg-white"
      aria-busy="true"
      aria-label="Loading folder"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="grid min-h-12 grid-cols-[1fr_44px] items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 md:grid-cols-[minmax(260px,1fr)_220px_120px_120px_90px_56px]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-5 w-5 shrink-0 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-44 max-w-[55vw] animate-pulse rounded bg-slate-200" />
          </div>
          <div className="hidden h-4 w-32 animate-pulse rounded bg-slate-100 md:block" />
          <div className="hidden h-4 w-20 animate-pulse rounded bg-slate-100 md:block" />
          <div className="hidden h-4 w-20 animate-pulse rounded bg-slate-100 md:block" />
          <div className="hidden h-4 w-14 animate-pulse rounded bg-slate-100 md:block" />
          <div className="h-6 w-6 justify-self-end animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function InstantLibraryBrowser({
  items,
  crumbs,
  rootId,
  admin = false,
  prefetchedFolders = {},
}: Props) {
  const router = useRouter();
  const favorites = useFavorites();
  const initialFolderId = crumbs.at(-1)?.id || rootId;
  const [currentCrumbs, setCurrentCrumbs] = useState(crumbs);
  const [localItems, setLocalItems] = useState(items);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderOnly, setFolderOnly] = useState(false);
  const [type, setType] = useState('all');
  const [modified, setModified] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sort, setSort] = useState('name');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [details, setDetails] = useState<DriveItem | null>(null);
  const [menu, setMenu] = useState<{
    item: DriveItem;
    x: number;
    y: number;
  } | null>(null);

  const cacheRef = useRef(new Map<string, CachedFolderView>());
  const windowReadyRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Map<string, Promise<FolderWindowPayload>>());
  const prefetchTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const currentFolderIdRef = useRef(initialFolderId);
  const crumbsRef = useRef(currentCrumbs);

  if (!cacheRef.current.has(initialFolderId)) {
    cacheRef.current.set(initialFolderId, { items, crumbs });
    windowReadyRef.current.add(initialFolderId);
    for (const [folderId, folderItems] of Object.entries(prefetchedFolders)) {
      const folder = items.find((item) => item.id === folderId && item.isFolder);
      if (!folder) continue;
      cacheRef.current.set(folderId, {
        items: folderItems,
        crumbs: [...crumbs, folder],
      });
    }
  }

  useEffect(() => {
    crumbsRef.current = currentCrumbs;
  }, [currentCrumbs]);

  useEffect(() => {
    const stored = localStorage.getItem('dp_view');
    if (stored === 'grid' || stored === 'list') setView(stored);
  }, []);

  const setPersist = (next: 'list' | 'grid') => {
    setView(next);
    localStorage.setItem('dp_view', next);
  };

  const primePayload = useCallback(
    (payload: FolderWindowPayload, crumbsHint?: DriveItem[]) => {
      const authoritativeCrumbs = payload.view.crumbs?.length
        ? payload.view.crumbs
        : crumbsHint || [crumbs[0]];
      cacheRef.current.set(payload.folderId, {
        items: payload.view.items,
        crumbs: authoritativeCrumbs,
      });
      windowReadyRef.current.add(payload.folderId);
      favorites?.mergeSaved(payload.favoriteIds || []);

      for (const [folderId, folderItems] of Object.entries(
        payload.prefetched || {},
      )) {
        const folder = payload.view.items.find(
          (item) => item.id === folderId && item.isFolder,
        );
        if (!folder) continue;
        cacheRef.current.set(folderId, {
          items: folderItems,
          crumbs: [...authoritativeCrumbs, folder],
        });
      }
      return authoritativeCrumbs;
    },
    [crumbs, favorites],
  );

  const loadWindow = useCallback(
    async (folderId: string, crumbsHint?: DriveItem[]) => {
      const existing = inFlightRef.current.get(folderId);
      if (existing) return existing;

      const request = fetch('/api/library/folder-window', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ folderId }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Folder request failed');
          const payload = (await response.json()) as FolderWindowPayload;
          primePayload(payload, crumbsHint);
          return payload;
        })
        .finally(() => {
          inFlightRef.current.delete(folderId);
        });

      inFlightRef.current.set(folderId, request);
      return request;
    },
    [primePayload],
  );

  const hydrateFolderWindow = useCallback(
    (folderId: string, crumbsHint?: DriveItem[]) => {
      if (windowReadyRef.current.has(folderId) || constrainedConnection())
        return;
      void loadWindow(folderId, crumbsHint).catch(() => undefined);
    },
    [loadWindow],
  );

  const applyFolder = useCallback(
    (
      folderId: string,
      fallbackCrumbs: DriveItem[],
      historyMode: 'push' | 'none',
    ) => {
      currentFolderIdRef.current = folderId;
      setDetails(null);
      setMenu(null);
      setFolderError(null);

      const cached = cacheRef.current.get(folderId);
      const nextCrumbs = cached?.crumbs || fallbackCrumbs;
      setCurrentCrumbs(nextCrumbs);
      if (cached) {
        setLocalItems(cached.items);
        setFolderLoading(false);
      } else {
        setLocalItems([]);
        setFolderLoading(true);
      }

      if (historyMode === 'push') {
        const href = hrefForFolder(folderId, rootId);
        const current = `${window.location.pathname}${window.location.search}`;
        if (href !== current) {
          window.history.pushState(
            { ...window.history.state, dpLibraryFolderId: folderId },
            '',
            href,
          );
        }
      }

      void loadWindow(folderId, nextCrumbs)
        .then((payload) => {
          if (currentFolderIdRef.current !== folderId) return;
          const cachedAfterLoad = cacheRef.current.get(folderId);
          setLocalItems(cachedAfterLoad?.items || payload.view.items);
          setCurrentCrumbs(cachedAfterLoad?.crumbs || payload.view.crumbs);
          setFolderLoading(false);
          setFolderError(null);
        })
        .catch(() => {
          if (currentFolderIdRef.current !== folderId) return;
          if (cached) {
            setFolderLoading(false);
            return;
          }
          setFolderLoading(false);
          setFolderError('We could not load this folder. Please try again.');
        });
    },
    [loadWindow, rootId],
  );

  const openFolder = useCallback(
    (item: DriveItem, historyMode: 'push' | 'none' = 'push') => {
      const current = crumbsRef.current;
      const existingIndex = current.findIndex((crumb) => crumb.id === item.id);
      const fallbackCrumbs =
        existingIndex >= 0
          ? current.slice(0, existingIndex + 1)
          : [...current, item];
      applyFolder(item.id, fallbackCrumbs, historyMode);
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [applyFolder],
  );

  const navigate = useCallback(
    (item: DriveItem, path: string, newTab = false) => {
      remember(item, path);
      const href = hrefFor(item, rootId);
      if (newTab) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (item.isFolder) {
        openFolder(item);
        return;
      }
      router.push(href);
    },
    [openFolder, rootId, router],
  );

  const schedulePrefetch = useCallback(
    (item: DriveItem) => {
      if (prefetchTimers.current.has(item.id)) return;
      const timer = setTimeout(() => {
        prefetchTimers.current.delete(item.id);
        if (item.isFolder) {
          const current = crumbsRef.current;
          const cached = cacheRef.current.get(item.id);
          hydrateFolderWindow(
            item.id,
            cached?.crumbs || [...current, item],
          );
        } else {
          router.prefetch(hrefFor(item, rootId));
        }
      }, 100);
      prefetchTimers.current.set(item.id, timer);
    },
    [hydrateFolderWindow, rootId, router],
  );

  const cancelPrefetch = useCallback((item: DriveItem) => {
    const timer = prefetchTimers.current.get(item.id);
    if (!timer) return;
    clearTimeout(timer);
    prefetchTimers.current.delete(item.id);
  }, []);

  useEffect(
    () => () => {
      prefetchTimers.current.forEach(clearTimeout);
      prefetchTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    const handlePopState = () => {
      const folderId =
        new URL(window.location.href).searchParams.get('folder') || rootId;
      if (folderId === currentFolderIdRef.current) return;
      const current = crumbsRef.current;
      const index = current.findIndex((crumb) => crumb.id === folderId);
      const cached = cacheRef.current.get(folderId);
      const fallbackCrumbs =
        cached?.crumbs ||
        (index >= 0 ? current.slice(0, index + 1) : [current[0]]);
      applyFolder(folderId, fallbackCrumbs, 'none');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyFolder, rootId]);

  const active = currentCrumbs.at(-1);
  const basePath = currentCrumbs
    .map((crumb, index) => (index === 0 ? 'Library' : crumb.name))
    .join(' / ');

  useEffect(() => {
    if (!active || active.id === rootId) return;
    remember(active, basePath);
    void fetch('/api/library/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: active.id, folderName: active.name }),
    }).catch(() => undefined);
  }, [active, basePath, rootId]);

  useEffect(() => {
    const childFolders = localItems.filter((item) => item.isFolder).slice(0, 8);
    const timer = setTimeout(() => {
      childFolders.forEach((folder) => {
        const cached = cacheRef.current.get(folder.id);
        hydrateFolderWindow(
          folder.id,
          cached?.crumbs || [...crumbsRef.current, folder],
        );
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [hydrateFolderWindow, localItems]);

  const sourceOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of localItems) {
      for (const source of item.attribution?.sources ?? []) {
        names.set(source.slug, source.shortLabel);
      }
    }
    return [...names]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [localItems]);

  const resourceTypeOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of localItems) {
      const resourceType = item.attribution?.resourceType;
      if (resourceType) names.set(resourceType.slug, resourceType.displayName);
    }
    return [...names]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [localItems]);

  const filtered = useMemo(
    () =>
      localItems
        .filter((item) => {
          if (folderOnly && !item.isFolder) return false;
          const label = typeLabel(item.mimeType, item.isFolder).toLowerCase();
          if (type !== 'all' && !label.includes(type)) return false;
          if (
            sourceFilter !== 'all' &&
            !(item.attribution?.sources ?? []).some(
              (source) => source.slug === sourceFilter,
            )
          )
            return false;
          if (
            resourceTypeFilter !== 'all' &&
            item.attribution?.resourceType?.slug !== resourceTypeFilter
          )
            return false;
          if (modified !== 'all' && item.modifiedTime) {
            const days =
              (Date.now() - new Date(item.modifiedTime).getTime()) / 86400000;
            if (modified === 'week' && days > 7) return false;
            if (modified === 'month' && days > 31) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const essential =
            Number(b.featuredPriority || 0) - Number(a.featuredPriority || 0);
          if (essential) return essential;
          const foldersFirst = Number(b.isFolder) - Number(a.isFolder);
          if (foldersFirst) return foldersFirst;
          if (sort === 'modified')
            return String(b.modifiedTime || '').localeCompare(
              String(a.modifiedTime || ''),
            );
          if (sort === 'type')
            return typeLabel(a.mimeType, a.isFolder).localeCompare(
              typeLabel(b.mimeType, b.isFolder),
            );
          if (sort === 'size') return Number(b.size || 0) - Number(a.size || 0);
          if (sort === 'source')
            return String(
              (a.attribution?.sources.find((source) => source.isPrimary) ??
                a.attribution?.sources[0])?.shortLabel ?? '',
            ).localeCompare(
              String(
                (b.attribution?.sources.find((source) => source.isPrimary) ??
                  b.attribution?.sources[0])?.shortLabel ?? '',
              ),
            );
          if (sort === 'resource-type')
            return String(
              a.attribution?.resourceType?.displayName ?? '',
            ).localeCompare(
              String(b.attribution?.resourceType?.displayName ?? ''),
            );
          return a.name.localeCompare(b.name);
        }),
    [
      folderOnly,
      localItems,
      modified,
      resourceTypeFilter,
      sort,
      sourceFilter,
      type,
    ],
  );

  const clearFilters = () => {
    setFolderOnly(false);
    setType('all');
    setModified('all');
    setSourceFilter('all');
    setResourceTypeFilter('all');
    setSort('name');
  };

  const parent =
    currentCrumbs.length > 1 ? currentCrumbs[currentCrumbs.length - 2] : null;

  return (
    <div className="space-y-3">
      {currentCrumbs.length > 1 && (
        <nav
          className="flex flex-wrap items-center gap-1 text-sm text-slate-500"
          aria-label="Breadcrumb"
        >
          {currentCrumbs.map((crumb, index) => (
            <span className="inline-flex items-center gap-1" key={crumb.id}>
              {index > 0 && <span>/</span>}
              <a
                className="font-medium hover:text-[color:var(--dp-blue)]"
                href={hrefForFolder(crumb.id, rootId)}
                onClick={(event) => {
                  if (!normalLeftClick(event)) return;
                  event.preventDefault();
                  if (crumb.id !== currentFolderIdRef.current) openFolder(crumb);
                }}
              >
                {index === 0 ? 'Library' : crumb.name}
              </a>
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">
            {active?.name || 'Library'}
          </h1>
          <Link
            href="/library/sources"
            className="mt-1 inline-block text-sm font-medium text-[color:var(--dp-blue)] hover:underline"
          >
            Browse by source
          </Link>
        </div>
      </div>

      {parent && (
        <a
          href={hrefForFolder(parent.id, rootId)}
          className="text-sm font-medium text-[color:var(--dp-blue)] hover:underline"
          onClick={(event) => {
            if (!normalLeftClick(event)) return;
            event.preventDefault();
            openFolder(parent);
          }}
        >
          Back to {parent.id === rootId ? 'Library' : parent.name}
        </a>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <SlidersHorizontal className="size-4" /> Filters
          </button>
          {currentCrumbs.length > 1 && active ? (
            <FolderSearchButton
              folderId={active.id}
              folderName={active.name}
            />
          ) : null}
        </div>
        <div className="flex gap-1">
          <button
            aria-label="List view"
            onClick={() => setPersist('list')}
            className={`rounded-md border px-2 py-1.5 ${view === 'list' ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white'}`}
          >
            <List className="size-4" />
          </button>
          <button
            aria-label="Grid view"
            onClick={() => setPersist('grid')}
            className={`rounded-md border px-2 py-1.5 ${view === 'grid' ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white'}`}
          >
            <Grid2X2 className="size-4" />
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex items-center gap-2 self-end">
            <input
              type="checkbox"
              checked={folderOnly}
              onChange={(event) => setFolderOnly(event.target.checked)}
            />
            Folders only
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              File type
            </span>
            <AppSelect
              value={type}
              onValueChange={setType}
              options={[
                { value: 'all', label: 'All types' },
                { value: 'pdf', label: 'PDF' },
                { value: 'word', label: 'Word' },
                { value: 'spreadsheet', label: 'Spreadsheet' },
                { value: 'image', label: 'Image' },
                { value: 'folder', label: 'Folder' },
              ]}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              Source
            </span>
            <AppSelect
              value={sourceFilter}
              onValueChange={setSourceFilter}
              options={[{ value: 'all', label: 'All sources' }, ...sourceOptions]}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              Resource type
            </span>
            <AppSelect
              value={resourceTypeFilter}
              onValueChange={setResourceTypeFilter}
              options={[
                { value: 'all', label: 'All resource types' },
                ...resourceTypeOptions,
              ]}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              Modified
            </span>
            <AppSelect
              value={modified}
              onValueChange={setModified}
              options={[
                { value: 'all', label: 'Any time' },
                { value: 'week', label: 'Past week' },
                { value: 'month', label: 'Past month' },
              ]}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              Sort
            </span>
            <AppSelect
              value={sort}
              onValueChange={setSort}
              options={[
                { value: 'name', label: 'Name' },
                { value: 'modified', label: 'Recently modified' },
                { value: 'type', label: 'Type' },
                { value: 'size', label: 'Size' },
                { value: 'source', label: 'Source' },
                { value: 'resource-type', label: 'Resource type' },
              ]}
            />
          </label>
          <button
            type="button"
            onClick={clearFilters}
            className="self-end justify-self-start text-sm font-medium text-[color:var(--dp-blue)]"
          >
            Clear filters
          </button>
        </div>
      )}

      {currentCrumbs.length === 1 &&
        localItems.find((item) => item.featuredLabel) && (
          <LibraryFeature
            item={localItems.find((item) => item.featuredLabel)!}
            path={basePath}
            onOpen={navigate}
          />
        )}

      {folderError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{folderError}</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              windowReadyRef.current.delete(currentFolderIdRef.current);
              setFolderError(null);
              setFolderLoading(true);
              void loadWindow(currentFolderIdRef.current, crumbsRef.current)
                .then(() => {
                  const cached = cacheRef.current.get(currentFolderIdRef.current);
                  if (cached) {
                    setLocalItems(cached.items);
                    setCurrentCrumbs(cached.crumbs);
                  }
                  setFolderLoading(false);
                })
                .catch(() => {
                  setFolderLoading(false);
                  setFolderError('We could not load this folder. Please try again.');
                });
            }}
          >
            Retry
          </button>
        </div>
      )}

      {folderLoading ? (
        <FolderLoadingRows />
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          No resources match these filters.
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onPointerEnter={() => schedulePrefetch(item)}
              onPointerLeave={() => cancelPrefetch(item)}
              onFocus={() => schedulePrefetch(item)}
              onBlur={() => cancelPrefetch(item)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey) {
                  event.preventDefault();
                  navigate(item, basePath, true);
                  return;
                }
                navigate(item, basePath);
              }}
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                navigate(item, basePath, true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') navigate(item, basePath);
                if (
                  event.key === 'ContextMenu' ||
                  (event.shiftKey && event.key === 'F10')
                ) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ item, x: rect.left, y: rect.bottom + 4 });
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenu({ item, x: event.clientX, y: event.clientY });
              }}
              className="group relative cursor-pointer rounded-md border border-slate-200 bg-white p-3 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
            >
              <button
                aria-label={`More actions for ${item.name}`}
                onAuxClick={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ item, x: rect.left, y: rect.bottom + 4 });
                }}
                className="absolute right-2 top-2 rounded-md p-1.5 text-slate-500 opacity-0 hover:bg-slate-100 hover:text-slate-800 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <MoreHorizontal className="size-5" />
              </button>
              <ResourceTypeIcon item={item} />
              <p className="mt-2 flex items-center gap-2 truncate pr-8 font-medium">
                <span className="truncate">{item.name}</span>
              </p>
              <p className="text-xs text-slate-500">
                {typeLabel(item.mimeType, item.isFolder)}
                {item.isFolder && item.estimatedSize
                  ? ` · ${formatEstimatedSize(item.estimatedSize)}`
                  : ''}
              </p>
              <div className="mt-2 min-w-0">
                <ResourceAttributionBadges attribution={item.attribution} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden border-y border-slate-200 bg-white">
          <div
            role="row"
            className="hidden grid-cols-[minmax(260px,1fr)_220px_120px_120px_90px_56px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid"
          >
            <span>Name</span>
            <span>Location</span>
            <span>Type</span>
            <span>Modified</span>
            <span>Size</span>
            <span>Actions</span>
          </div>
          {filtered.map((item) => (
            <ResourceRow
              key={item.id}
              item={item}
              rootId={rootId}
              path={basePath}
              onMenu={(menuItem, x, y) => setMenu({ item: menuItem, x, y })}
              navigate={navigate}
              schedulePrefetch={schedulePrefetch}
              cancelPrefetch={cancelPrefetch}
            />
          ))}
        </div>
      )}

      {menu && (
        <ResourceContextMenu
          item={menu.item}
          rootId={rootId}
          path={basePath}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onDetails={() => setDetails(menu.item)}
          navigate={navigate}
        />
      )}
      {details && (
        <ResourceDetailsPanel
          item={details}
          path={basePath}
          rootId={rootId}
          admin={admin}
          onFeaturedChange={(next) => {
            setDetails(next);
            setLocalItems((previous) =>
              previous.map((item) => (item.id === next.id ? next : item)),
            );
            const current = cacheRef.current.get(currentFolderIdRef.current);
            if (current) {
              cacheRef.current.set(currentFolderIdRef.current, {
                ...current,
                items: current.items.map((item) =>
                  item.id === next.id ? next : item,
                ),
              });
            }
          }}
          onClose={() => setDetails(null)}
        />
      )}
    </div>
  );
}

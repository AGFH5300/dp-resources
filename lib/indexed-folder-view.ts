import 'server-only';
import { unstable_cache } from 'next/cache';
import type { DriveItem, ResourceIndex } from './types';
import { createSupabaseAdminClient } from './supabase-admin';
import { rootFolderId } from './drive';
import { getFeaturedResourceMap } from './featured-resources';
import { getIndexedFolderSizeSummaries } from './folder-summaries';
import { getResourceAttributionMap } from './content-attribution';
import {
  getResourceIndexSnapshot,
  primeIndexedResourceShellItems,
  primeIndexedResourceShellRows,
} from './indexed-resource';

const MAX_PREFETCH_FOLDERS = 64;

type IndexedFolderView = {
  items: DriveItem[];
  crumbs: DriveItem[];
};

export type IndexedFolderWindow = {
  view: IndexedFolderView;
  prefetched: Record<string, DriveItem[]>;
  indexRevision: string;
};

function toDriveItem(row: ResourceIndex): DriveItem {
  return {
    id: row.drive_file_id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size_bytes == null ? undefined : String(row.size_bytes),
    modifiedTime: row.modified_at || undefined,
    isFolder: row.is_folder,
    path: row.path,
  };
}

function rootCrumb(): DriveItem {
  return {
    id: rootFolderId(),
    name: 'Library',
    mimeType: 'application/vnd.google-apps.folder',
    isFolder: true,
    path: 'Library',
  };
}

async function getCrumbs(
  sb: ReturnType<typeof createSupabaseAdminClient>,
  folderRow: ResourceIndex | null,
) {
  const crumbs: DriveItem[] = [rootCrumb()];
  if (!folderRow) return crumbs;

  const parts = String(folderRow.path || '')
    .split(' / ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts[0] !== 'Library') {
    crumbs.push(toDriveItem(folderRow));
    return crumbs;
  }

  const paths: string[] = [];
  let path = 'Library';
  for (const part of parts.slice(1)) {
    path += ` / ${part}`;
    paths.push(path);
  }
  if (!paths.length) return crumbs;

  const { data, error } = await sb
    .from('dp_resource_index')
    .select('*')
    .eq('is_folder', true)
    .in('path', paths);
  if (error || !data?.length) {
    crumbs.push(toDriveItem(folderRow));
    return crumbs;
  }

  const byPath = new Map(
    (data as ResourceIndex[]).map((row) => [row.path, row] as const),
  );
  for (const ancestorPath of paths) {
    const row = byPath.get(ancestorPath);
    if (row) crumbs.push(toDriveItem(row));
  }
  if (crumbs.at(-1)?.id !== folderRow.drive_file_id) {
    crumbs.push(toDriveItem(folderRow));
  }
  return crumbs;
}

function decorateRows(
  rows: ResourceIndex[],
  folderSummaries: Map<string, number>,
  featured: Awaited<ReturnType<typeof getFeaturedResourceMap>>,
  attribution: Awaited<ReturnType<typeof getResourceAttributionMap>>,
) {
  return rows
    .map((row) => {
      const hit = featured.get(row.drive_file_id);
      const base = toDriveItem(row);
      base.attribution = attribution.get(row.drive_file_id);
      const withSize =
        row.is_folder && folderSummaries.has(row.drive_file_id)
          ? { ...base, estimatedSize: folderSummaries.get(row.drive_file_id) }
          : base;
      return hit
        ? {
            ...withSize,
            featuredLabel: hit.label,
            featuredPriority: hit.priority,
          }
        : withSize;
    })
    .sort(
      (a, b) =>
        Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name),
    );
}

const getIndexedFolderWindowCached = unstable_cache(
  async (
    folderId: string,
    indexRevision: string,
  ): Promise<IndexedFolderWindow | null> => {
    const sb = createSupabaseAdminClient();
    const folderRowPromise =
      folderId === rootFolderId()
        ? Promise.resolve({ data: null, error: null } as const)
        : sb
            .from('dp_resource_index')
            .select('*')
            .eq('drive_file_id', folderId)
            .eq('is_folder', true)
            .maybeSingle();
    const childrenPromise = sb
      .from('dp_resource_index')
      .select('*')
      .eq('parent_drive_file_id', folderId)
      .order('is_folder', { ascending: false })
      .order('name');

    const [{ data: folderData, error: folderError }, { data: childData, error }] =
      await Promise.all([folderRowPromise, childrenPromise]);
    const folderRow = (folderData as ResourceIndex | null) ?? null;
    if (
      error ||
      folderError ||
      (folderId !== rootFolderId() && !folderRow)
    ) {
      return null;
    }

    const childRows = (childData || []) as ResourceIndex[];
    const currentFolderIds = childRows
      .filter((row) => row.is_folder)
      .map((row) => row.drive_file_id);
    const prefetchFolderIds = currentFolderIds.slice(0, MAX_PREFETCH_FOLDERS);

    const grandchildrenPromise = prefetchFolderIds.length
      ? sb
          .from('dp_resource_index')
          .select('*')
          .in('parent_drive_file_id', prefetchFolderIds)
      : Promise.resolve({ data: [], error: null } as const);
    const crumbsPromise = getCrumbs(sb, folderRow);
    const [{ data: grandchildData }, crumbs] = await Promise.all([
      grandchildrenPromise,
      crumbsPromise,
    ]);
    const grandchildRows = (grandchildData || []) as ResourceIndex[];
    const allRows = [...childRows, ...grandchildRows];
    const allIds = [...new Set(allRows.map((row) => row.drive_file_id))];

    // Folder-size aggregation is the expensive descendant scan. Keep it scoped
    // to the rows the user can see now; a child window will calculate its own
    // visible folder sizes when that window is hydrated.
    const [folderSummaries, featured, attribution] = await Promise.all([
      getIndexedFolderSizeSummaries(currentFolderIds, { indexReady: true }),
      getFeaturedResourceMap(allIds),
      getResourceAttributionMap(allIds),
    ]);

    // Reuse the metadata this exact completed index revision already loaded.
    // Resource authorization independently re-reads the current revision before
    // it accepts any hot entry, so a new/active sync cannot inherit stale access.
    primeIndexedResourceShellRows(allRows, attribution, indexRevision);

    const view = {
      items: decorateRows(childRows, folderSummaries, featured, attribution),
      crumbs,
    };
    const prefetched: Record<string, DriveItem[]> = {};
    for (const prefetchedFolderId of prefetchFolderIds) {
      prefetched[prefetchedFolderId] = decorateRows(
        grandchildRows.filter(
          (row) => row.parent_drive_file_id === prefetchedFolderId,
        ),
        folderSummaries,
        featured,
        attribution,
      );
    }

    return { view, prefetched, indexRevision };
  },
  ['indexed-folder-window-v3'],
  { revalidate: 60 },
);

export async function getIndexedFolderWindow(folderId = rootFolderId()) {
  // This snapshot is deliberately fresh. Passing the completed-at revision into
  // the cache key invalidates old folder/resource data as soon as a sync starts
  // or a newly completed index becomes authoritative.
  const snapshot = await getResourceIndexSnapshot();
  if (!snapshot.ready || !snapshot.revision) return null;

  const window = await getIndexedFolderWindowCached(folderId, snapshot.revision);
  if (window) {
    // unstable_cache can satisfy this call without executing its callback. Prime
    // the process-local file cache from the cached payload as well.
    primeIndexedResourceShellItems(
      [
        ...window.view.items,
        ...Object.values(window.prefetched).flat(),
      ],
      window.indexRevision,
    );
  }
  return window;
}

export async function getIndexedFolderView(folderId = rootFolderId()) {
  return (await getIndexedFolderWindow(folderId))?.view ?? null;
}

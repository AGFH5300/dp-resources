import 'server-only';
import { unstable_cache } from 'next/cache';
import type { DriveItem, ResourceIndex } from './types';
import { createSupabaseAdminClient } from './supabase-admin';
import { rootFolderId } from './drive';
import { getFeaturedResourceMap } from './featured-resources';
import { getIndexedFolderSizeSummaries } from './folder-summaries';
import { getResourceAttributionMap } from './content-attribution';

function toDriveItem(row: ResourceIndex): DriveItem {
  return {
    id: row.drive_file_id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size_bytes == null ? undefined : String(row.size_bytes),
    modifiedTime: row.modified_at || undefined,
    isFolder: row.is_folder,
  };
}

function syncComplete(state: any) {
  const queued = Array.isArray(state?.folder_queue)
    ? state.folder_queue.length
    : 0;
  return (
    state?.status === 'complete' && Boolean(state?.completed_at) && queued === 0
  );
}

const getIndexedFolderViewCached = unstable_cache(
  async (folderId: string) => {
    const sb = createSupabaseAdminClient();
    const { data: state } = await sb
      .from('dp_resource_index_sync_state')
      .select('status,completed_at,folder_queue')
      .limit(1)
      .maybeSingle();
    if (!syncComplete(state)) return null;

    const folderRowPromise =
      folderId === rootFolderId()
        ? Promise.resolve({ data: null, error: null } as any)
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
    const [{ data: folderRow }, { data: rows, error }] = await Promise.all([
      folderRowPromise,
      childrenPromise,
    ]);
    if (
      error ||
      (folderId !== rootFolderId() && !folderRow) ||
      (!rows?.length && folderId !== rootFolderId() && !folderRow)
    )
      return null;

    const crumbs: DriveItem[] = [
      {
        id: rootFolderId(),
        name: 'Library',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: true,
      },
    ];

    if (folderRow) {
      const chain: ResourceIndex[] = [];
      let current: ResourceIndex | null = folderRow as ResourceIndex;
      while (
        current &&
        current.drive_file_id !== rootFolderId() &&
        chain.length < 25
      ) {
        chain.unshift(current);
        if (
          !current.parent_drive_file_id ||
          current.parent_drive_file_id === rootFolderId()
        )
          break;
        const { data: parent } = await sb
          .from('dp_resource_index')
          .select('*')
          .eq('drive_file_id', current.parent_drive_file_id)
          .maybeSingle();
        current = (parent as ResourceIndex | null) ?? null;
      }
      for (const row of chain) crumbs.push(toDriveItem(row));
    }

    const childRows = (rows || []) as ResourceIndex[];
    const childIds = childRows.map((row) => row.drive_file_id);
    const folderIds = childRows
      .filter((row) => row.is_folder)
      .map((row) => row.drive_file_id);

    const [folderSummaries, featured, attribution] = await Promise.all([
      getIndexedFolderSizeSummaries(folderIds),
      getFeaturedResourceMap(childIds),
      getResourceAttributionMap(childIds),
    ]);

    const items = childRows
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
    return { items, crumbs };
  },
  ['indexed-folder-view-v2'],
  { revalidate: 60 },
);

export async function getIndexedFolderView(folderId = rootFolderId()) {
  return getIndexedFolderViewCached(folderId);
}

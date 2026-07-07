import 'server-only';
import type { DriveItem, ResourceIndex } from './types';
import { createSupabaseAdminClient } from './supabase-admin';
import { rootFolderId } from './drive';
import { getFeaturedResourceMap } from './featured-resources';
import { getIndexedFolderSizeSummaries } from './folder-summaries';

function toDriveItem(row: ResourceIndex): DriveItem {
  return { id: row.drive_file_id, name: row.name, mimeType: row.mime_type, size: row.size_bytes == null ? undefined : String(row.size_bytes), modifiedTime: row.modified_at || undefined, isFolder: row.is_folder };
}

function syncComplete(state: any) {
  const queued = Array.isArray(state?.folder_queue) ? state.folder_queue.length : 0;
  return state?.status === 'complete' && Boolean(state?.completed_at) && queued === 0;
}

export async function getIndexedFolderView(folderId = rootFolderId()) {
  const sb = createSupabaseAdminClient();
  const { data: state } = await sb.from('dp_resource_index_sync_state').select('status,completed_at,folder_queue').limit(1).maybeSingle();
  if (!syncComplete(state)) return null;

  const parentId = folderId === rootFolderId() ? null : folderId;
  const folderRowPromise = folderId === rootFolderId()
    ? Promise.resolve({ data: null, error: null } as any)
    : sb.from('dp_resource_index').select('*').eq('drive_file_id', folderId).eq('is_folder', true).maybeSingle();
  const childrenPromise = sb.from('dp_resource_index').select('*').eq('parent_drive_file_id', folderId).order('is_folder', { ascending: false }).order('name');
  const [{ data: folderRow }, { data: rows, error }] = await Promise.all([folderRowPromise, childrenPromise]);
  if (error || (folderId !== rootFolderId() && !folderRow) || (!rows?.length && folderId !== rootFolderId() && !folderRow)) return null;

  const crumbs: DriveItem[] = [{ id: rootFolderId(), name: 'Library', mimeType: 'application/vnd.google-apps.folder', isFolder: true }];
  if (folderRow?.path) {
    const ids: string[] = [];
    let current: any = folderRow;
    while (current?.parent_drive_file_id && current.drive_file_id !== rootFolderId() && ids.length < 25) {
      ids.unshift(current.drive_file_id);
      const { data: parent } = await sb.from('dp_resource_index').select('*').eq('drive_file_id', current.parent_drive_file_id).maybeSingle();
      current = parent;
    }
    const { data: crumbRows = [] } = ids.length ? await sb.from('dp_resource_index').select('*').in('drive_file_id', ids) : { data: [] as any[] };
    const byId = new Map((crumbRows as ResourceIndex[]).map((r) => [r.drive_file_id, r]));
    for (const id of ids) { const row = byId.get(id); if (row) crumbs.push(toDriveItem(row)); }
  }

  const folderSummaries = await getIndexedFolderSizeSummaries(((rows || []) as ResourceIndex[]).filter((r) => r.is_folder).map((r) => r.drive_file_id));
  const featured = await getFeaturedResourceMap((rows || []).map((r: any) => r.drive_file_id));
  const items = ((rows || []) as ResourceIndex[]).map((r) => { const hit = featured.get(r.drive_file_id); const base = toDriveItem(r); const withSize = r.is_folder && folderSummaries.has(r.drive_file_id) ? { ...base, estimatedSize: folderSummaries.get(r.drive_file_id) } : base; return hit ? { ...withSize, featuredLabel: hit.label, featuredPriority: hit.priority } : withSize; })
    .sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));
  return { items, crumbs };
}

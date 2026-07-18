export type RecentResource = {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string;
  path: string;
  at: number;
};

type RecentActivity = {
  file_id: string | null;
  file_name: string;
  action: 'folder_opened' | 'file_opened' | 'download_started';
  created_at: string;
};

type IndexedRecentResource = {
  drive_file_id: string;
  name: string;
  mime_type: string;
  is_folder: boolean;
  path: string | null;
};

export function recentResourcesFromActivity(
  activity: RecentActivity[],
  indexedResources: IndexedRecentResource[],
  limit = 12,
) {
  const indexedById = new Map(
    indexedResources.map((resource) => [resource.drive_file_id, resource]),
  );
  const seen = new Set<string>();
  const recent: RecentResource[] = [];

  for (const entry of activity) {
    if (
      !entry.file_id ||
      entry.action === 'download_started' ||
      seen.has(entry.file_id)
    ) {
      continue;
    }
    seen.add(entry.file_id);
    const indexed = indexedById.get(entry.file_id);
    const isFolder = indexed?.is_folder ?? entry.action === 'folder_opened';
    const at = Date.parse(entry.created_at);
    recent.push({
      id: entry.file_id,
      name: indexed?.name || entry.file_name || 'Resource',
      isFolder,
      mimeType:
        indexed?.mime_type ||
        (isFolder ? 'application/vnd.google-apps.folder' : ''),
      path: indexed?.path || 'Library',
      at: Number.isFinite(at) ? at : 0,
    });
    if (recent.length >= limit) break;
  }

  return recent;
}

export function mergeRecentResources(
  ...sources: RecentResource[][]
): RecentResource[] {
  const latest = new Map<string, RecentResource>();
  for (const resource of sources.flat()) {
    if (!resource?.id) continue;
    const current = latest.get(resource.id);
    if (!current || resource.at > current.at) latest.set(resource.id, resource);
  }
  return [...latest.values()].sort((a, b) => b.at - a.at).slice(0, 12);
}

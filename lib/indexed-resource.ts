import 'server-only';
import { unstable_cache } from 'next/cache';
import { createSupabaseAdminClient } from './supabase-admin';
import type { DriveItem, ResourceIndex } from './types';
import { getResourceAttributionMap } from './content-attribution';

export type IndexedResourceShell = DriveItem & { path?: string };

type HotShell = {
  value: IndexedResourceShell;
  expiresAt: number;
  full: boolean;
};

const HOT_TTL_MS = 90_000;
const HOT_MAX = 768;
const hotShells = new Map<string, HotShell>();

function syncComplete(state: any) {
  return (
    state?.status === 'complete' &&
    Boolean(state?.completed_at) &&
    (!Array.isArray(state?.folder_queue) || state.folder_queue.length === 0)
  );
}

const indexReadyCached = unstable_cache(
  async () => {
    const sb = createSupabaseAdminClient();
    const { data: state } = await sb
      .from('dp_resource_index_sync_state')
      .select('status,completed_at,folder_queue')
      .limit(1)
      .maybeSingle();
    return syncComplete(state);
  },
  ['indexed-resource-ready-v1'],
  { revalidate: 30 },
);

function shellFromRow(
  row: Pick<
    ResourceIndex,
    | 'drive_file_id'
    | 'name'
    | 'mime_type'
    | 'is_folder'
    | 'size_bytes'
    | 'modified_at'
    | 'path'
  >,
): IndexedResourceShell {
  return {
    id: row.drive_file_id,
    name: row.name,
    mimeType: row.mime_type,
    isFolder: row.is_folder,
    size: row.size_bytes == null ? undefined : String(row.size_bytes),
    modifiedTime: row.modified_at || undefined,
    path: row.path,
  };
}

function readHot(fileId: string): HotShell | null {
  const hit = hotShells.get(fileId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    hotShells.delete(fileId);
    return null;
  }
  // Refresh recency so the map behaves like a tiny LRU.
  hotShells.delete(fileId);
  hotShells.set(fileId, hit);
  return hit;
}

function writeHot(value: IndexedResourceShell, full: boolean) {
  hotShells.delete(value.id);
  hotShells.set(value.id, {
    value,
    full,
    expiresAt: Date.now() + HOT_TTL_MS,
  });
  while (hotShells.size > HOT_MAX) {
    const oldest = hotShells.keys().next().value as string | undefined;
    if (!oldest) break;
    hotShells.delete(oldest);
  }
}

export function primeIndexedResourceShellRows(
  rows: ResourceIndex[],
  attribution: Awaited<ReturnType<typeof getResourceAttributionMap>>,
) {
  for (const row of rows) {
    if (row.is_folder) continue;
    writeHot(
      {
        ...shellFromRow(row),
        attribution: attribution.get(row.drive_file_id),
      },
      true,
    );
  }
}

export function primeIndexedResourceShellItems(items: DriveItem[]) {
  for (const item of items) {
    if (item.isFolder) continue;
    const existing = readHot(item.id);
    writeHot(
      {
        ...existing?.value,
        ...item,
        path: item.path || existing?.value.path,
        attribution: item.attribution ?? existing?.value.attribution,
      },
      true,
    );
  }
}

const getIndexedResourceCoreCached = unstable_cache(
  async (fileId: string): Promise<IndexedResourceShell | null> => {
    if (!(await indexReadyCached())) return null;
    const sb = createSupabaseAdminClient();
    const { data } = await sb
      .from('dp_resource_index')
      .select(
        'drive_file_id,name,mime_type,is_folder,size_bytes,modified_at,path',
      )
      .eq('drive_file_id', fileId)
      .maybeSingle();
    if (!data) return null;
    return shellFromRow(data as ResourceIndex);
  },
  ['indexed-resource-core-v2'],
  { revalidate: 60 },
);

export async function getIndexedResourceCore(
  fileId: string,
): Promise<IndexedResourceShell | null> {
  const hot = readHot(fileId);
  if (hot) return hot.value;
  const core = await getIndexedResourceCoreCached(fileId);
  if (core) writeHot(core, false);
  return core;
}

const getIndexedResourceShellCached = unstable_cache(
  async (fileId: string): Promise<IndexedResourceShell | null> => {
    const core = await getIndexedResourceCoreCached(fileId);
    if (!core) return null;
    const attribution = await getResourceAttributionMap([fileId]);
    return {
      ...core,
      attribution: attribution.get(fileId),
    };
  },
  ['indexed-resource-shell-v2'],
  { revalidate: 60 },
);

export async function getIndexedResourceShell(
  fileId: string,
): Promise<IndexedResourceShell | null> {
  const hot = readHot(fileId);
  if (hot?.full) return hot.value;
  const shell = await getIndexedResourceShellCached(fileId);
  if (shell) writeHot(shell, true);
  return shell;
}

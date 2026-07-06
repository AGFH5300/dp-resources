import 'server-only';
import { Readable } from 'node:stream';
import { unstable_cache } from 'next/cache';
import { google, drive_v3 } from 'googleapis';
import type { DriveItem } from './types';
import { normalizeSearch, safeDownloadName, workspaceExportFor } from './drive-utils';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
export { normalizeSearch, safeDownloadName, workspaceExportFor };

let cachedDrive: drive_v3.Drive | null = null;
let cachedSheets: ReturnType<typeof google.sheets> | null = null;

export function isDriveConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export const rootFolderId = () => process.env.GOOGLE_DRIVE_FOLDER_ID!;

function driveAuth() {
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

function drive() {
  if (cachedDrive) return cachedDrive;
  cachedDrive = google.drive({ version: 'v3', auth: driveAuth() });
  return cachedDrive;
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function toItem(f: drive_v3.Schema$File): DriveItem {
  return {
    id: f.id || '',
    name: f.name || 'Untitled',
    mimeType: f.mimeType || 'application/octet-stream',
    size: f.size || undefined,
    modifiedTime: f.modifiedTime || undefined,
    isFolder: f.mimeType === FOLDER_MIME,
  };
}

async function getRawMetadata(fileId: string) {
  const res = await drive().files.get({ fileId, fields: 'id,name,mimeType,size,modifiedTime,parents', supportsAllDrives: true });
  return res.data;
}

export function sheetsClient() {
  if (cachedSheets) return cachedSheets;
  cachedSheets = google.sheets({ version: 'v4', auth: driveAuth() });
  return cachedSheets;
}

export async function getDriveMetadata(fileId: string) {
  if (!isDriveConfigured()) return null;
  try {
    return toItem(await getRawMetadata(fileId));
  } catch {
    return null;
  }
}

async function resolvePathUncached(rootId: string, folderId: string) {
  if (!folderId || !isDriveConfigured()) return { insideRoot: false, crumbs: [] as DriveItem[] };
  const crumbs: DriveItem[] = [];
  let current = folderId;
  const seen = new Set<string>();

  for (let depth = 0; depth < 25 && current && !seen.has(current); depth++) {
    seen.add(current);
    const meta = await getRawMetadata(current).catch(() => null);
    if (!meta) return { insideRoot: false, crumbs: [] as DriveItem[] };
    crumbs.unshift(toItem(meta));
    if (current === rootId) return { insideRoot: true, crumbs };
    current = meta.parents?.[0] || '';
  }

  return { insideRoot: false, crumbs: [] as DriveItem[] };
}

const cachedResolvePath = unstable_cache(resolvePathUncached, ['drive-path-v2'], { revalidate: 90 });

async function listFolderUncached(rootId: string, folderId: string) {
  const query = [`'${escapeDriveQueryValue(folderId)}' in parents`, 'trashed=false'];
  const files: DriveItem[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive().files.list({
      q: query.join(' and '),
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
      orderBy: 'folder,name',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(...(res.data.files || []).map(toItem));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return files.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));
}

const cachedListFolder = unstable_cache(listFolderUncached, ['drive-folder-v2'], { revalidate: 90 });

export async function isInsideRoot(fileId: string) {
  if (fileId === rootFolderId()) return true;
  return (await cachedResolvePath(rootFolderId(), fileId)).insideRoot;
}

export async function assertInsideRoot(fileId: string) {
  return isInsideRoot(fileId);
}

export async function getFolderView(folderId = rootFolderId()) {
  if (!isDriveConfigured()) return { items: [] as DriveItem[], crumbs: [] as DriveItem[] };
  const rootId = rootFolderId();
  const path = await cachedResolvePath(rootId, folderId);
  if (!path.insideRoot) return { items: [] as DriveItem[], crumbs: [] as DriveItem[] };
  const items = await cachedListFolder(rootId, folderId);
  return { items, crumbs: path.crumbs };
}

export async function listDriveItems(folderId = rootFolderId(), q = '') {
  const { items } = await getFolderView(folderId);
  const search = normalizeSearch(q);
  if (!search) return items;
  return items.filter((item) => normalizeSearch(item.name).includes(search));
}

export async function breadcrumbsToRoot(folderId: string) {
  return (await getFolderView(folderId)).crumbs;
}

export function nodeToWebStream(stream: NodeJS.ReadableStream) {
  return Readable.toWeb(stream as Readable) as ReadableStream;
}

export async function getDriveStream(fileId: string, mimeType: string) {
  const exportSpec = workspaceExportFor(mimeType);
  if (mimeType.startsWith('application/vnd.google-apps.') && !exportSpec) return { unavailable: true as const };
  if (exportSpec) {
    const res = await drive().files.export({ fileId, mimeType: exportSpec.mimeType }, { responseType: 'stream' });
    return { stream: nodeToWebStream(res.data as NodeJS.ReadableStream), contentType: exportSpec.mimeType, extension: exportSpec.extension, headers: res.headers };
  }
  const res = await drive().files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  return { stream: nodeToWebStream(res.data as NodeJS.ReadableStream), contentType: mimeType, headers: res.headers };
}

export type DriveIndexFolderCursor = { id: string; path: string; parent: string | null };

export async function crawlDriveIndexChunk(options: { queue: DriveIndexFolderCursor[]; maxFolders?: number; maxItems?: number }) {
  const maxFolders = options.maxFolders ?? 12;
  const maxItems = options.maxItems ?? 500;
  const rootId = rootFolderId();
  const queue: DriveIndexFolderCursor[] = [...options.queue];
  if (!queue.length) queue.push({ id: rootId, path: 'Library', parent: null });
  const first = queue[0];
  if (first.id !== rootId && !(await assertInsideRoot(first.id))) throw new Error('Index cursor escaped the configured Drive root.');
  const rows: Array<{ drive_file_id: string; parent_drive_file_id: string | null; name: string; normalized_name: string; path: string; mime_type: string; is_folder: boolean; size_bytes: number | null; modified_at: string | null }> = [];
  let processedFolders = 0;
  while (queue.length && processedFolders < maxFolders && rows.length < maxItems) {
    const folder = queue.shift()!;
    if (folder.id !== rootId && !(await assertInsideRoot(folder.id))) continue;
    const { items } = await getFolderView(folder.id);
    processedFolders += 1;
    for (const item of items) {
      const path = `${folder.path} / ${item.name}`;
      rows.push({
        drive_file_id: item.id,
        parent_drive_file_id: folder.id,
        name: item.name,
        normalized_name: normalizeSearch(item.name),
        path,
        mime_type: item.mimeType,
        is_folder: item.isFolder,
        size_bytes: item.size ? Number(item.size) : null,
        modified_at: item.modifiedTime || null,
      });
      if (item.isFolder) queue.push({ id: item.id, path, parent: folder.id });
      if (rows.length >= maxItems) break;
    }
  }
  return { rows, queue, complete: queue.length === 0, remainingFolders: queue.length, processedFolders };
}

export async function crawlDriveIndex(options: { maxItems?: number } = {}) {
  const maxItems = options.maxItems ?? 500;
  const rootId = rootFolderId();
  const queue: Array<{ id: string; path: string; parent: string | null }> = [{ id: rootId, path: 'Library', parent: null }];
  const rows: Array<{ drive_file_id: string; parent_drive_file_id: string | null; name: string; normalized_name: string; path: string; mime_type: string; is_folder: boolean; size_bytes: number | null; modified_at: string | null }> = [];
  while (queue.length && rows.length < maxItems) {
    const folder = queue.shift()!;
    const { items } = await getFolderView(folder.id);
    for (const item of items) {
      const path = `${folder.path} / ${item.name}`;
      rows.push({
        drive_file_id: item.id,
        parent_drive_file_id: folder.id,
        name: item.name,
        normalized_name: normalizeSearch(item.name),
        path,
        mime_type: item.mimeType,
        is_folder: item.isFolder,
        size_bytes: item.size ? Number(item.size) : null,
        modified_at: item.modifiedTime || null,
      });
      if (item.isFolder && rows.length < maxItems) queue.push({ id: item.id, path, parent: folder.id });
      if (rows.length >= maxItems) break;
    }
  }
  return { rows, complete: queue.length === 0, remainingFolders: queue.length };
}

import 'server-only';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import type { DriveItem } from './types';
import { normalizeSearch, safeDownloadName, workspaceExportFor } from './drive-utils';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
export { normalizeSearch, safeDownloadName, workspaceExportFor };

export function isDriveConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}
export const rootFolderId = () => process.env.GOOGLE_DRIVE_FOLDER_ID!;
function drive() {
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const auth = new google.auth.JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return google.drive({ version: 'v3', auth });
}
function escapeDriveQueryValue(value: string) { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function toItem(f: any): DriveItem { return { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || undefined, modifiedTime: f.modifiedTime || undefined, isFolder: f.mimeType === FOLDER_MIME }; }

export async function getDriveMetadata(fileId: string) {
  if (!isDriveConfigured()) return null;
  try {
    const res = await drive().files.get({ fileId, fields: 'id,name,mimeType,size,modifiedTime,parents', supportsAllDrives: true });
    return toItem(res.data);
  } catch { return null; }
}

async function getParents(fileId: string) {
  const res = await drive().files.get({ fileId, fields: 'id,parents', supportsAllDrives: true });
  return res.data.parents || [];
}

export async function isInsideRoot(fileId: string, maxDepth = 25) {
  if (!fileId || !isDriveConfigured()) return false;
  if (fileId === rootFolderId()) return true;
  let frontier = [fileId];
  const seen = new Set<string>();
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      const parents = await getParents(id).catch(() => []);
      if (parents.includes(rootFolderId())) return true;
      next.push(...parents);
    }
    frontier = next;
  }
  return false;
}

export async function assertInsideRoot(fileId: string) { return isInsideRoot(fileId); }

export async function listDriveItems(folderId = rootFolderId(), q = '') {
  if (!isDriveConfigured() || !(await isInsideRoot(folderId))) return [] as DriveItem[];
  const search = normalizeSearch(q);
  const query = [`'${escapeDriveQueryValue(folderId)}' in parents`, 'trashed=false'];
  if (search) query.push(`name contains '${escapeDriveQueryValue(search)}'`);
  const res = await drive().files.list({ q: query.join(' and '), fields: 'files(id,name,mimeType,size,modifiedTime)', orderBy: 'folder,name', pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true });
  return (res.data.files || []).map(toItem).sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));
}

export async function breadcrumbsToRoot(folderId: string) {
  if (!(await isInsideRoot(folderId))) return [];
  const crumbs: DriveItem[] = [];
  let current = folderId;
  for (let depth = 0; depth < 25; depth++) {
    const meta = await getDriveMetadata(current);
    if (!meta) break;
    crumbs.unshift(meta);
    if (current === rootFolderId()) break;
    const parents = await getParents(current).catch(() => []);
    current = parents[0];
    if (!current) break;
  }
  return crumbs;
}

export function nodeToWebStream(stream: NodeJS.ReadableStream) { return Readable.toWeb(stream as Readable) as ReadableStream; }
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

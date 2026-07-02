import type { DriveItem } from './types';

export type ResourceRecord = {
  drive_file_id: string;
  parent_drive_file_id: string | null;
  name: string;
  normalized_name: string;
  path: string;
  mime_type: string;
  is_folder: boolean;
  size_bytes: number | null;
  modified_at: string | null;
  indexed_at?: string;
};

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function normalizeResourceName(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function typeLabel(mimeType: string, isFolder = false) {
  if (isFolder || mimeType === FOLDER_MIME) return 'Folder';
  const lower = mimeType.toLowerCase();
  if (lower.includes('pdf')) return 'PDF';
  if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('sheet')) return 'Spreadsheet';
  if (lower.includes('presentation') || lower.includes('powerpoint')) return 'Presentation';
  if (lower.includes('word') || lower.includes('document')) return 'Word document';
  if (lower.startsWith('image/')) return 'Image';
  if (lower.startsWith('text/') || lower.includes('csv') || lower.includes('plain')) return 'Text file';
  return 'Other file';
}

export function formatSize(size?: string | number | null) {
  if (size == null || size === '') return '—';
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

export function itemToResource(item: DriveItem, path: string): ResourceRecord {
  return {
    drive_file_id: item.id,
    parent_drive_file_id: null,
    name: item.name,
    normalized_name: normalizeResourceName(item.name),
    path,
    mime_type: item.mimeType,
    is_folder: item.isFolder,
    size_bytes: item.size ? Number(item.size) : null,
    modified_at: item.modifiedTime || null,
  };
}

export function resourceUrl(item: { drive_file_id?: string; id?: string; is_folder?: boolean; isFolder?: boolean }) {
  const id = item.drive_file_id || item.id || '';
  return (item.is_folder || item.isFolder) ? `/library?folder=${encodeURIComponent(id)}` : `/resource/${encodeURIComponent(id)}`;
}

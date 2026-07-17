export const WORKSPACE_EXPORTS: Record<
  string,
  { mimeType: string; extension: string }
> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/pdf',
    extension: 'pdf',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/pdf',
    extension: 'pdf',
  },
};
export function workspaceExportFor(mimeType: string) {
  return WORKSPACE_EXPORTS[mimeType] || null;
}
export function normalizeSearch(value = '') {
  return value.trim().slice(0, 100);
}
export function safeDownloadName(name: string, extension?: string) {
  const cleaned = name.replace(/[\\/\r\n"]/g, '').trim() || 'download';
  return extension && !cleaned.toLowerCase().endsWith(`.${extension}`)
    ? `${cleaned}.${extension}`
    : cleaned;
}

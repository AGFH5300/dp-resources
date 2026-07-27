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
  const ascii =
    cleaned
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'download';
  return extension && !ascii.toLowerCase().endsWith(`.${extension}`)
    ? `${ascii}.${extension}`
    : ascii;
}

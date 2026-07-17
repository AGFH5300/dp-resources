const FOLDER_MIME = 'application/vnd.google-apps.folder';

const MIME_LABELS: Record<string, string> = {
  [FOLDER_MIME]: 'Folder',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'Excel spreadsheet',
  'application/vnd.ms-excel': 'Excel spreadsheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'Word document',
  'application/msword': 'Word document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'PowerPoint presentation',
  'application/vnd.ms-powerpoint': 'PowerPoint presentation',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'text/csv': 'CSV',
  'application/csv': 'CSV',
  'application/zip': 'ZIP archive',
  'application/x-zip-compressed': 'ZIP archive',
  'text/plain': 'Text file',
};

const EXTENSION_LABELS: Record<string, string> = {
  pdf: 'PDF',
  xlsx: 'Excel spreadsheet',
  xls: 'Excel spreadsheet',
  docx: 'Word document',
  doc: 'Word document',
  pptx: 'PowerPoint presentation',
  ppt: 'PowerPoint presentation',
  csv: 'CSV',
  zip: 'ZIP archive',
  txt: 'Text file',
  rtf: 'Text file',
  md: 'Text file',
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
  gif: 'Image',
  webp: 'Image',
  svg: 'Image',
  mp3: 'Audio',
  wav: 'Audio',
  m4a: 'Audio',
  aac: 'Audio',
  mp4: 'Video',
  mov: 'Video',
  webm: 'Video',
};

function extensionFor(fileName?: string | null) {
  const match = (fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

export function formatMimeType(
  mimeType?: string | null,
  fileName?: string | null,
): string {
  const mime = (mimeType || '').toLowerCase().trim();
  const ext = extensionFor(fileName);

  if (mime && MIME_LABELS[mime]) return MIME_LABELS[mime];
  if (ext && EXTENSION_LABELS[ext]) return EXTENSION_LABELS[ext];
  if (mime.startsWith('image/')) return 'Image';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('text/')) return 'Text file';

  return 'Unknown file';
}

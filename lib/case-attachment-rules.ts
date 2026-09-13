export const CASE_ATTACHMENT_MAX_FILES = 6;
export const CASE_ATTACHMENT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const CASE_ATTACHMENT_MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
export const CASE_ATTACHMENT_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const CASE_ATTACHMENT_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
export const CASE_ATTACHMENT_MAX_REQUEST_BYTES = 32 * 1024 * 1024;

export const CASE_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
] as const;

export const CASE_ATTACHMENT_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.txt',
  '.csv',
].join(',');

const EXTENSION_TO_KIND = new Map<string, 'image' | 'video' | 'document'>([
  ['jpg', 'image'],
  ['jpeg', 'image'],
  ['png', 'image'],
  ['webp', 'image'],
  ['gif', 'image'],
  ['mp4', 'video'],
  ['webm', 'video'],
  ['mov', 'video'],
  ['pdf', 'document'],
  ['docx', 'document'],
  ['xlsx', 'document'],
  ['pptx', 'document'],
  ['txt', 'document'],
  ['csv', 'document'],
]);

function extensionOf(name: string) {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

export function caseAttachmentKind(
  file: Pick<File, 'name' | 'type'>,
): 'image' | 'video' | 'document' | null {
  const type = file.type.toLowerCase();
  if (type.startsWith('image/') && CASE_ATTACHMENT_ALLOWED_MIME_TYPES.includes(type as any)) {
    return 'image';
  }
  if (type.startsWith('video/') && CASE_ATTACHMENT_ALLOWED_MIME_TYPES.includes(type as any)) {
    return 'video';
  }
  if (CASE_ATTACHMENT_ALLOWED_MIME_TYPES.includes(type as any)) return 'document';
  return EXTENSION_TO_KIND.get(extensionOf(file.name)) || null;
}

export function caseAttachmentMaxBytes(
  file: Pick<File, 'name' | 'type'>,
) {
  const kind = caseAttachmentKind(file);
  if (kind === 'image') return CASE_ATTACHMENT_MAX_IMAGE_BYTES;
  if (kind === 'video') return CASE_ATTACHMENT_MAX_VIDEO_BYTES;
  if (kind === 'document') return CASE_ATTACHMENT_MAX_DOCUMENT_BYTES;
  return 0;
}

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function validateCaseAttachmentSelection(files: File[]) {
  if (files.length > CASE_ATTACHMENT_MAX_FILES) {
    return `Attach up to ${CASE_ATTACHMENT_MAX_FILES} files.`;
  }

  let total = 0;
  for (const file of files) {
    const max = caseAttachmentMaxBytes(file);
    if (!max) {
      return `${file.name || 'That file'} is not a supported file type.`;
    }
    if (file.size < 1) return `${file.name || 'That file'} is empty.`;
    if (file.size > max) {
      return `${file.name} is too large. The limit for this file type is ${formatAttachmentSize(max)}.`;
    }
    total += file.size;
  }

  if (total > CASE_ATTACHMENT_MAX_TOTAL_BYTES) {
    return `Attachments can be up to ${formatAttachmentSize(CASE_ATTACHMENT_MAX_TOTAL_BYTES)} in total.`;
  }

  return null;
}

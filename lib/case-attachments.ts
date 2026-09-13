import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import {
  CASE_ATTACHMENT_MAX_DOCUMENT_BYTES,
  CASE_ATTACHMENT_MAX_FILES,
  CASE_ATTACHMENT_MAX_IMAGE_BYTES,
  CASE_ATTACHMENT_MAX_TOTAL_BYTES,
  CASE_ATTACHMENT_MAX_VIDEO_BYTES,
} from '@/lib/case-attachment-rules';
import {
  AttachmentScanError,
  scanAttachmentForMalware,
} from '@/lib/attachment-malware-scan';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const CASE_ATTACHMENT_BUCKET = 'dp-case-attachments';

export type CaseAttachmentKind = 'support' | 'report';

type DetectedAttachment = {
  mimeType: string;
  extension: string;
  kind: 'image' | 'video' | 'document';
};

export type PreparedCaseAttachment = DetectedAttachment & {
  originalName: string;
  bytes: Uint8Array;
  sizeBytes: number;
  sha256: string;
  scanProvider: string;
};

export class CaseAttachmentError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CaseAttachmentError';
    this.status = status;
  }
}

function extensionOf(name: string) {
  return name.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
}

function sanitizedOriginalName(name: string) {
  const clean = name
    .normalize('NFKC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return (clean || 'attachment').slice(0, 180);
}

function startsWith(bytes: Uint8Array, expected: number[]) {
  return (
    bytes.length >= expected.length &&
    expected.every((value, index) => bytes[index] === value)
  );
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return Buffer.from(bytes.slice(start, end)).toString('ascii');
}

async function detectOfficeDocument(
  bytes: Uint8Array,
  extension: string,
): Promise<DetectedAttachment | null> {
  if (!['docx', 'xlsx', 'pptx'].includes(extension)) return null;
  if (!startsWith(bytes, [0x50, 0x4b])) return null;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(Buffer.from(bytes), {
      checkCRC32: false,
      createFolders: false,
    });
  } catch {
    return null;
  }

  if (!zip.file('[Content_Types].xml')) return null;
  if (extension === 'docx' && zip.file('word/document.xml')) {
    return {
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension,
      kind: 'document',
    };
  }
  if (extension === 'xlsx' && zip.file('xl/workbook.xml')) {
    return {
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension,
      kind: 'document',
    };
  }
  if (extension === 'pptx' && zip.file('ppt/presentation.xml')) {
    return {
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension,
      kind: 'document',
    };
  }
  return null;
}

async function detectAttachment(
  bytes: Uint8Array,
  fileName: string,
): Promise<DetectedAttachment | null> {
  const extension = extensionOf(fileName);

  if (
    startsWith(bytes, [0xff, 0xd8, 0xff]) &&
    ['jpg', 'jpeg'].includes(extension)
  ) {
    return { mimeType: 'image/jpeg', extension: 'jpg', kind: 'image' };
  }
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    extension === 'png'
  ) {
    return { mimeType: 'image/png', extension, kind: 'image' };
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 12) === 'WEBP' &&
    extension === 'webp'
  ) {
    return { mimeType: 'image/webp', extension, kind: 'image' };
  }
  if (
    (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') &&
    extension === 'gif'
  ) {
    return { mimeType: 'image/gif', extension, kind: 'image' };
  }
  if (ascii(bytes, 0, 5) === '%PDF-' && extension === 'pdf') {
    return { mimeType: 'application/pdf', extension, kind: 'document' };
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 4, 8) === 'ftyp' &&
    ['mp4', 'mov'].includes(extension)
  ) {
    return {
      mimeType: extension === 'mov' ? 'video/quicktime' : 'video/mp4',
      extension,
      kind: 'video',
    };
  }
  if (
    startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) &&
    extension === 'webm'
  ) {
    return { mimeType: 'video/webm', extension, kind: 'video' };
  }

  const office = await detectOfficeDocument(bytes, extension);
  if (office) return office;

  if (['txt', 'csv'].includes(extension)) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\u0000')) return null;
      return {
        mimeType: extension === 'csv' ? 'text/csv' : 'text/plain',
        extension,
        kind: 'document',
      };
    } catch {
      return null;
    }
  }

  return null;
}

function maxBytesFor(detected: DetectedAttachment) {
  if (detected.kind === 'image') return CASE_ATTACHMENT_MAX_IMAGE_BYTES;
  if (detected.kind === 'video') return CASE_ATTACHMENT_MAX_VIDEO_BYTES;
  return CASE_ATTACHMENT_MAX_DOCUMENT_BYTES;
}

export function caseAttachmentFiles(formData: FormData) {
  const values = formData.getAll('attachments');
  if (values.length > CASE_ATTACHMENT_MAX_FILES) {
    throw new CaseAttachmentError(
      `Attach up to ${CASE_ATTACHMENT_MAX_FILES} files.`,
      413,
    );
  }
  if (values.some((value) => !(value instanceof File))) {
    throw new CaseAttachmentError('Invalid attachment upload.');
  }
  return values as File[];
}

export async function prepareCaseAttachments(
  files: File[],
): Promise<PreparedCaseAttachment[]> {
  if (!files.length) return [];
  if (files.length > CASE_ATTACHMENT_MAX_FILES) {
    throw new CaseAttachmentError(
      `Attach up to ${CASE_ATTACHMENT_MAX_FILES} files.`,
      413,
    );
  }

  const declaredTotal = files.reduce((sum, file) => sum + file.size, 0);
  if (declaredTotal > CASE_ATTACHMENT_MAX_TOTAL_BYTES) {
    throw new CaseAttachmentError('Attachments are too large in total.', 413);
  }

  const prepared: PreparedCaseAttachment[] = [];
  let actualTotal = 0;

  for (const file of files) {
    if (file.size < 1) {
      throw new CaseAttachmentError(`${file.name || 'An attachment'} is empty.`);
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      throw new CaseAttachmentError(`Could not read ${file.name || 'an attachment'}.`);
    }

    actualTotal += bytes.length;
    if (actualTotal > CASE_ATTACHMENT_MAX_TOTAL_BYTES) {
      throw new CaseAttachmentError('Attachments are too large in total.', 413);
    }

    const originalName = sanitizedOriginalName(file.name);
    const detected = await detectAttachment(bytes, originalName);
    if (!detected) {
      throw new CaseAttachmentError(
        `${originalName} is not a supported or valid file.`,
        415,
      );
    }
    if (bytes.length > maxBytesFor(detected)) {
      throw new CaseAttachmentError(`${originalName} is too large.`, 413);
    }

    let scanProvider: string;
    try {
      const scan = await scanAttachmentForMalware({
        bytes,
        fileName: originalName,
        mimeType: detected.mimeType,
      });
      scanProvider = scan.provider;
    } catch (error) {
      if (error instanceof AttachmentScanError) {
        throw new CaseAttachmentError(
          error.message,
          error.code === 'malware' ? 422 : 503,
        );
      }
      throw error;
    }

    prepared.push({
      ...detected,
      originalName,
      bytes,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      scanProvider,
    });
  }

  return prepared;
}

export async function persistCaseAttachments(input: {
  kind: CaseAttachmentKind;
  caseId: string;
  uploaderId: string;
  attachments: PreparedCaseAttachment[];
}) {
  if (!input.attachments.length) return [];

  const sb = createSupabaseAdminClient();
  const paths: string[] = [];
  const rows: Array<Record<string, unknown>> = [];

  try {
    for (const attachment of input.attachments) {
      const path = `${input.kind}/${input.caseId}/${randomUUID()}.${attachment.extension}`;
      const { error } = await sb.storage
        .from(CASE_ATTACHMENT_BUCKET)
        .upload(path, attachment.bytes, {
          upsert: false,
          contentType: attachment.mimeType,
          cacheControl: '600',
        });
      if (error) throw error;
      paths.push(path);
      rows.push({
        uploader_id: input.uploaderId,
        support_ticket_id: input.kind === 'support' ? input.caseId : null,
        resource_report_id: input.kind === 'report' ? input.caseId : null,
        storage_path: path,
        original_name: attachment.originalName,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        sha256: attachment.sha256,
        scan_status: 'clean',
        scan_provider: attachment.scanProvider,
      });
    }

    const { data, error } = await sb
      .from('dp_case_attachments')
      .insert(rows)
      .select(
        'id,original_name,mime_type,size_bytes,scan_status,created_at,storage_path',
      );
    if (error) throw error;
    return data || [];
  } catch (error) {
    if (paths.length) {
      await sb.storage.from(CASE_ATTACHMENT_BUCKET).remove(paths).catch(() => undefined);
    }
    console.error('[case-attachments] persistence failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    throw new CaseAttachmentError('Could not save attachments.', 503);
  }
}

export async function removeCaseAttachmentObjects(paths: string[]) {
  if (!paths.length) return;
  const sb = createSupabaseAdminClient();
  await sb.storage.from(CASE_ATTACHMENT_BUCKET).remove(paths).catch(() => undefined);
}

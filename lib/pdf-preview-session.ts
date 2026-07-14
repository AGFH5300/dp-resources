import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type PdfPreviewSessionPayload = {
  version: 1;
  audience: 'pdf-preview';
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  modifiedTime?: string;
  userId: string;
  previewId: string;
  previewVersionKey: string;
  previewStorageProvider: 'supabase' | 'r2';
  previewStorageBucket: string;
  previewStoragePrefix: string;
  expiresAt: number;
};

type NewPdfPreviewSession = Omit<PdfPreviewSessionPayload, 'version' | 'audience' | 'expiresAt'>;

export const PDF_PREVIEW_SESSION_TTL_SECONDS = 2 * 60 * 60;

export function pdfPreviewSessionCookieName(fileId: string) {
  const suffix = createHash('sha256').update(fileId).digest('hex').slice(0, 20);
  return `dp_pdf_${suffix}`;
}

export function pdfPreviewSessionCookiePath(fileId: string) {
  return `/api/resource/${encodeURIComponent(fileId)}`;
}

function signingSecret() {
  const secret = process.env.PDF_PREVIEW_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('PDF preview sessions are not configured');
  return secret;
}

function signatureFor(encodedPayload: string) {
  return createHmac('sha256', signingSecret()).update(encodedPayload).digest();
}

export function createPdfPreviewSession(input: NewPdfPreviewSession, nowMs = Date.now()) {
  const payload: PdfPreviewSessionPayload = {
    version: 1,
    audience: 'pdf-preview',
    ...input,
    expiresAt: Math.floor(nowMs / 1000) + PDF_PREVIEW_SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signatureFor(encodedPayload).toString('base64url');
  return { token: `${encodedPayload}.${signature}`, expiresAt: payload.expiresAt };
}

export function verifyPdfPreviewSession(token: string | null, expectedFileId: string, nowMs = Date.now()) {
  if (!token) return null;
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return null;
  }
  const expectedSignature = signatureFor(encodedPayload);
  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) return null;

  let parsed: Partial<PdfPreviewSessionPayload>;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<PdfPreviewSessionPayload>;
  } catch {
    return null;
  }

  if (
    parsed.version !== 1 ||
    parsed.audience !== 'pdf-preview' ||
    parsed.fileId !== expectedFileId ||
    typeof parsed.fileName !== 'string' ||
    typeof parsed.mimeType !== 'string' ||
    !Number.isSafeInteger(parsed.size) ||
    Number(parsed.size) <= 0 ||
    typeof parsed.userId !== 'string' ||
    typeof parsed.previewId !== 'string' ||
    parsed.previewId.length < 16 ||
    typeof parsed.previewVersionKey !== 'string' ||
    parsed.previewVersionKey.length < 32 ||
    !Number.isSafeInteger(parsed.expiresAt) ||
    Number(parsed.expiresAt) <= Math.floor(nowMs / 1000)
  ) return null;

  // Sessions issued before R2 support did not contain storage fields. Keep those
  // short-lived cookies valid by resolving them to the original Supabase location.
  const previewStorageProvider = parsed.previewStorageProvider || 'supabase';
  const previewStorageBucket = parsed.previewStorageBucket || 'pdf-previews';
  const previewStoragePrefix = parsed.previewStoragePrefix || `${parsed.fileId}/${parsed.previewVersionKey}`;
  if (
    !['supabase', 'r2'].includes(previewStorageProvider) ||
    typeof previewStorageBucket !== 'string' ||
    !previewStorageBucket.trim() ||
    typeof previewStoragePrefix !== 'string' ||
    !previewStoragePrefix.trim()
  ) return null;

  return {
    ...parsed,
    previewStorageProvider,
    previewStorageBucket,
    previewStoragePrefix,
  } as PdfPreviewSessionPayload;
}

function cookieValue(req: Request, name: string) {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator) === name) return trimmed.slice(separator + 1) || null;
  }
  return null;
}

export function pdfPreviewSessionFromRequest(req: Request, fileId: string) {
  const headerToken = req.headers.get('x-dp-pdf-session');
  const cookieToken = cookieValue(req, pdfPreviewSessionCookieName(fileId));
  return verifyPdfPreviewSession(headerToken || cookieToken, fileId);
}

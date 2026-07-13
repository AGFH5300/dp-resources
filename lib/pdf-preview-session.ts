import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export type PdfPreviewSessionPayload = {
  version: 1;
  audience: 'pdf-preview';
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  modifiedTime?: string;
  userId: string;
  expiresAt: number;
};

type NewPdfPreviewSession = Omit<PdfPreviewSessionPayload, 'version' | 'audience' | 'expiresAt'>;

const SESSION_TTL_SECONDS = 2 * 60 * 60;

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
    expiresAt: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS,
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

  let payload: PdfPreviewSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as PdfPreviewSessionPayload;
  } catch {
    return null;
  }

  if (
    payload.version !== 1 ||
    payload.audience !== 'pdf-preview' ||
    payload.fileId !== expectedFileId ||
    typeof payload.fileName !== 'string' ||
    typeof payload.mimeType !== 'string' ||
    !Number.isSafeInteger(payload.size) ||
    payload.size <= 0 ||
    typeof payload.userId !== 'string' ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= Math.floor(nowMs / 1000)
  ) return null;

  return payload;
}

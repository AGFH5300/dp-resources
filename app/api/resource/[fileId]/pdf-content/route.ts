import { fetchDriveMediaResponse } from '@/lib/media-range';
import {
  pdfPreviewSessionCookieName,
  verifyPdfPreviewSession,
} from '@/lib/pdf-preview-session';
import { parseSingleByteRange } from '@/lib/range-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RANGE_BYTES = 32 * 1024 * 1024;

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

function sessionFrom(req: Request, fileId: string) {
  const headerToken = req.headers.get('x-dp-pdf-session');
  const cookieToken = cookieValue(req, pdfPreviewSessionCookieName(fileId));
  return verifyPdfPreviewSession(headerToken || cookieToken, fileId);
}

function baseHeaders(size: number) {
  return new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=300, must-revalidate',
    vary: 'Cookie, Range',
    'x-content-type-options': 'nosniff',
    'x-file-size': String(size),
  });
}

export async function HEAD(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const session = sessionFrom(req, fileId);
  if (!session) return new Response('Invalid or expired PDF preview session', { status: 401 });
  const headers = baseHeaders(session.size);
  headers.set('content-type', session.mimeType || 'application/pdf');
  headers.set('content-length', String(session.size));
  return new Response(null, { status: 200, headers });
}

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const session = sessionFrom(req, fileId);
  if (!session) return new Response('Invalid or expired PDF preview session', { status: 401 });

  const requestedRange = req.headers.get('range');
  const rangeDecision = parseSingleByteRange(requestedRange, session.size);
  if (requestedRange && rangeDecision.kind === 'invalid') {
    const headers = baseHeaders(session.size);
    headers.set('content-range', `bytes */${session.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (rangeDecision.kind === 'range' && rangeDecision.end - rangeDecision.start + 1 > MAX_RANGE_BYTES) {
    const headers = baseHeaders(session.size);
    headers.set('content-range', `bytes */${session.size}`);
    return new Response('Requested range is too large', { status: 416, headers });
  }

  const rangeHeader = rangeDecision.kind === 'range' ? rangeDecision.header : undefined;
  const upstream = await fetchDriveMediaResponse(fileId, session.mimeType, session.fileName, rangeHeader).catch(() => null);
  if (!upstream) return new Response('Unable to retrieve this PDF', { status: 502 });

  const headers = baseHeaders(session.size);
  for (const name of ['content-type', 'content-length', 'content-range', 'content-disposition', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.get('content-type')) headers.set('content-type', session.mimeType || 'application/pdf');
  if (!headers.get('content-disposition')) headers.set('content-disposition', `inline; filename="${session.fileName.replace(/["\\]/g, '_')}"`);
  if (!requestedRange && !headers.get('content-length')) headers.set('content-length', String(session.size));

  if (rangeHeader && (upstream.status !== 206 || !headers.get('content-range'))) {
    console.error('Google Drive ignored a PDF byte range', {
      fileId,
      requestedRange: rangeHeader,
      upstreamStatus: upstream.status,
      upstreamContentRange: headers.get('content-range'),
    });
    return new Response('PDF range request was not honored', { status: 502, headers: baseHeaders(session.size) });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

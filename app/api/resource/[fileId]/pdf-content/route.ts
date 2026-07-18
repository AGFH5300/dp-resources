import { fetchDriveMediaResponse } from '@/lib/media-range';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';
import { parseSingleByteRange } from '@/lib/range-requests';
import { validatePdfRangeUpstream } from '@/lib/pdf-range-integrity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RANGE_BYTES = 32 * 1024 * 1024;

function baseHeaders(size: number) {
  return new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=300, must-revalidate',
    vary: 'Cookie, Range',
    'x-content-type-options': 'nosniff',
    'x-file-size': String(size),
  });
}

export async function HEAD(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session)
    return new Response('Invalid or expired PDF preview session', {
      status: 401,
    });
  const headers = baseHeaders(session.size);
  headers.set('content-type', session.mimeType || 'application/pdf');
  headers.set('content-length', String(session.size));
  return new Response(null, { status: 200, headers });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session)
    return new Response('Invalid or expired PDF preview session', {
      status: 401,
    });

  const requestedRange = req.headers.get('range');
  if (!requestedRange)
    return new Response('A byte range is required', {
      status: 400,
      headers: baseHeaders(session.size),
    });
  const rangeDecision = parseSingleByteRange(requestedRange, session.size);
  if (rangeDecision.kind === 'invalid') {
    const headers = baseHeaders(session.size);
    headers.set('content-range', `bytes */${session.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (
    rangeDecision.kind === 'range' &&
    rangeDecision.end - rangeDecision.start + 1 > MAX_RANGE_BYTES
  ) {
    const headers = baseHeaders(session.size);
    headers.set('content-range', `bytes */${session.size}`);
    return new Response('Requested range is too large', {
      status: 416,
      headers,
    });
  }

  const rangeHeader =
    rangeDecision.kind === 'range' ? rangeDecision.header : undefined;
  const upstream = await fetchDriveMediaResponse(
    fileId,
    session.mimeType,
    session.fileName,
    rangeHeader,
  ).catch(() => null);
  if (!upstream)
    return new Response('Unable to retrieve this PDF', { status: 502 });

  const headers = baseHeaders(session.size);
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'content-disposition',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.get('content-type'))
    headers.set('content-type', session.mimeType || 'application/pdf');
  if (!headers.get('content-disposition'))
    headers.set(
      'content-disposition',
      `inline; filename="${session.fileName.replace(/["\\]/g, '_')}"`,
    );

  if (rangeHeader) {
    const integrityError = validatePdfRangeUpstream(
      rangeDecision,
      session.size,
      upstream,
    );
    if (integrityError) {
      console.error('Google Drive returned invalid PDF byte-range semantics', {
        fileId,
        requestedRange: rangeHeader,
        integrityError,
        upstreamStatus: upstream.status,
        upstreamContentRange: headers.get('content-range'),
        upstreamContentLength: headers.get('content-length'),
      });
      return new Response('PDF range request was not honored', {
        status: 502,
        headers: baseHeaders(session.size),
      });
    }
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

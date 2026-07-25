import { requireMember } from '@/lib/auth';
import {
  assertInsideRoot,
  getDriveMetadata,
  getDriveStream,
  isDriveConfigured,
  safeDownloadName,
} from '@/lib/drive';
import { getIndexedResourceShell } from '@/lib/indexed-resource';
import { fetchDriveMediaResponse } from '@/lib/media-range';
import { recordFileOpenedOnce } from '@/lib/activity';
import { devTiming, etagFor, nowMs, serverTiming } from '@/lib/perf';
import { needsRangeSupport } from '@/lib/resource-capabilities';
import { ifRangeMatches, parseSingleByteRange } from '@/lib/range-requests';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BUFFERED_PDF_FALLBACK_BYTES = 32 * 1024 * 1024;

function isPdfResource(mimeType: string, name: string) {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(name);
}

async function readBufferedPdfFallback(
  fileId: string,
  mimeType: string,
  size: number,
) {
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAX_BUFFERED_PDF_FALLBACK_BYTES
  ) {
    return null;
  }

  const fallbackMedia = await getDriveStream(fileId, mimeType).catch((error) => {
    console.error('Google Drive buffered PDF fallback failed to open', {
      fileId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (!fallbackMedia || 'unavailable' in fallbackMedia) return null;

  const reader = fallbackMedia.stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk =
        value instanceof Uint8Array
          ? value
          : new Uint8Array(value as ArrayBuffer);
      total += chunk.byteLength;
      if (total > MAX_BUFFERED_PDF_FALLBACK_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk);
    }
  } catch (error) {
    console.error('Google Drive buffered PDF fallback failed while reading', {
      fileId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    reader.releaseLock();
  }

  if (!total) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    bytes,
    contentType:
      fallbackMedia.contentType || mimeType || 'application/pdf',
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const authStart = nowMs();
  const { user } = await requireMember();
  const authMs = nowMs() - authStart;
  if (!isDriveConfigured())
    return new Response('Resources are not yet available', { status: 503 });
  const { fileId } = await params;
  const requestedRange = req.headers.get('range');
  const isRangeRequest = Boolean(requestedRange);
  const rateScope = isRangeRequest
    ? 'resource-content-range'
    : 'resource-content';
  const limited = await rateLimit(
    privacySafeRequestKey(req, rateScope),
    isRangeRequest ? 600 : 120,
    10 * 60 * 1000,
    rateScope,
  );
  if (!limited.ok)
    return new Response('Too many requests. Please try again later.', {
      status: 429,
    });
  const validateStart = nowMs();
  const indexedMeta = await getIndexedResourceShell(fileId);
  if (!indexedMeta && !(await assertInsideRoot(fileId)))
    return new Response('Not found', { status: 404 });
  const meta = indexedMeta || (await getDriveMetadata(fileId));
  const validateMs = nowMs() - validateStart;
  if (!meta || meta.isFolder) return new Response('Not found', { status: 404 });
  const etag = etagFor([fileId, meta.modifiedTime, meta.size]);
  const headers = new Headers({
    etag: etag,
    'cache-control': 'private, max-age=300, must-revalidate',
    vary: 'Cookie',
    'server-timing': [
      serverTiming('auth', authMs),
      serverTiming('validate', validateMs),
    ].join(', '),
    'x-file-size': String(meta.size),
  });
  const rangeCapable = needsRangeSupport(meta.mimeType, meta.name);
  const rangeDecision =
    requestedRange && rangeCapable
      ? parseSingleByteRange(requestedRange, meta.size)
      : { kind: 'none' as const };
  if (rangeDecision.kind === 'invalid') {
    headers.set('content-range', `bytes */${rangeDecision.total}`);
    headers.set('accept-ranges', 'bytes');
    return new Response(null, { status: 416, headers });
  }
  const shouldServeRange =
    rangeDecision.kind === 'range' &&
    ifRangeMatches(req.headers.get('if-range'), etag);
  const auditOpen = () =>
    recordFileOpenedOnce(req, {
      userId: user.id,
      userEmail: user.email!,
      fileId,
      fileName: meta.name,
    }).catch(() => undefined);
  if (
    requestedRange &&
    rangeDecision.kind === 'range' &&
    rangeCapable &&
    shouldServeRange
  ) {
    const native = await fetchDriveMediaResponse(
      fileId,
      meta.mimeType,
      meta.name,
      rangeDecision.header,
    ).catch(() => null);
    if (!native)
      return new Response('Unable to retrieve this file', { status: 502 });
    auditOpen();
    const nativeHeaders = new Headers(native.headers);
    nativeHeaders.set('x-file-size', String(meta.size));
    if (!nativeHeaders.get('content-range'))
      return new Response(native.body, { status: 200, headers: nativeHeaders });
    return native.status === 206
      ? new Response(native.body, { status: 206, headers: nativeHeaders })
      : new Response(native.body, {
          status: native.status,
          headers: nativeHeaders,
        });
  }
  if (!requestedRange && req.headers.get('if-none-match') === etag) {
    auditOpen();
    return new Response(null, { status: 304, headers });
  }

  // Standard PDFs are loaded as one authenticated response by the fallback reader.
  // Prefer the native fetch/Web Stream path, then fully buffer only smaller PDFs
  // through googleapis if the deployment runtime cannot maintain that stream.
  if (!requestedRange && isPdfResource(meta.mimeType, meta.name)) {
    const streamStart = nowMs();
    const native = await fetchDriveMediaResponse(
      fileId,
      meta.mimeType,
      meta.name,
    ).catch((error) => {
      console.error('Google Drive PDF fetch failed', {
        fileId,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (native?.ok) {
      const streamMs = nowMs() - streamStart;
      devTiming('resource.content', { authMs, validateMs, streamMs });
      auditOpen();
      const nativeHeaders = new Headers(native.headers);
      nativeHeaders.set('etag', etag);
      nativeHeaders.set('x-file-size', String(meta.size));
      nativeHeaders.set(
        'server-timing',
        [
          serverTiming('auth', authMs),
          serverTiming('validate', validateMs),
          serverTiming('stream', streamMs),
        ].join(', '),
      );
      return new Response(native.body, {
        status: native.status,
        headers: nativeHeaders,
      });
    }

    const upstreamStatus = native?.status ?? null;
    await native?.body?.cancel().catch(() => undefined);
    const buffered = await readBufferedPdfFallback(
      fileId,
      meta.mimeType,
      Number(meta.size),
    );
    if (!buffered) {
      console.error('All Google Drive PDF delivery paths failed', {
        fileId,
        upstreamStatus,
        size: meta.size,
      });
      return new Response('Unable to retrieve this PDF', { status: 502 });
    }

    const streamMs = nowMs() - streamStart;
    devTiming('resource.content', { authMs, validateMs, streamMs });
    auditOpen();
    headers.set('content-type', buffered.contentType);
    headers.set('content-length', String(buffered.bytes.byteLength));
    headers.set('accept-ranges', 'bytes');
    headers.set(
      'content-disposition',
      `inline; filename="${safeDownloadName(meta.name)}"`,
    );
    headers.set(
      'server-timing',
      [
        serverTiming('auth', authMs),
        serverTiming('validate', validateMs),
        serverTiming('stream', streamMs),
      ].join(', '),
    );
    headers.set('x-pdf-delivery', 'buffered-fallback');
    return new Response(buffered.bytes, { status: 200, headers });
  }

  const streamStart = nowMs();
  const media = await getDriveStream(
    fileId,
    meta.mimeType,
    shouldServeRange ? rangeDecision.header : undefined,
  ).catch(() => null);
  if (!media)
    return new Response('Unable to retrieve this file', { status: 502 });
  if ('unavailable' in media)
    return new Response(
      'Preview is unavailable for this Google Workspace file type.',
      { status: 415 },
    );
  const streamMs = nowMs() - streamStart;
  devTiming('resource.content', { authMs, validateMs, streamMs });
  auditOpen();
  headers.set('content-type', media.contentType);
  const mediaHeaders = media.headers || {};
  const contentRange = mediaHeaders['content-range'];
  const contentLength = mediaHeaders['content-length'];
  if (rangeCapable) headers.set('accept-ranges', 'bytes');
  if (contentRange) headers.set('content-range', String(contentRange));
  if (contentLength) headers.set('content-length', String(contentLength));
  else if (!shouldServeRange) headers.set('content-length', String(meta.size));
  headers.set(
    'content-disposition',
    `inline; filename="${safeDownloadName(meta.name, media.extension)}"`,
  );
  headers.set(
    'server-timing',
    [
      serverTiming('auth', authMs),
      serverTiming('validate', validateMs),
      serverTiming('stream', streamMs),
    ].join(', '),
  );
  return new Response(media.stream, {
    status: shouldServeRange && contentRange ? 206 : 200,
    headers,
  });
}

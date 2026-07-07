import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, getDriveStream, isDriveConfigured, safeDownloadName } from '@/lib/drive';
import { fetchDriveMediaResponse } from '@/lib/media-range';
import { recordActivity } from '@/lib/activity';
import { devTiming, etagFor, nowMs, serverTiming } from '@/lib/perf';
import { needsRangeSupport } from '@/lib/resource-capabilities';
import { ifRangeMatches, parseSingleByteRange } from '@/lib/range-requests';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const authStart = nowMs();
  const { user } = await requireMember();
  const authMs = nowMs() - authStart;
  if (!isDriveConfigured()) return new Response('Resources are not yet available', { status: 503 });
  const { fileId } = await params;
  const limited = await rateLimit(privacySafeRequestKey(req, 'resource-content'), 120, 10 * 60 * 1000, 'resource-content');
  if (!limited.ok) return new Response('Too many requests. Please try again later.', { status: 429 });
  const validateStart = nowMs();
  if (!(await assertInsideRoot(fileId))) return new Response('Not found', { status: 404 });
  const meta = await getDriveMetadata(fileId);
  const validateMs = nowMs() - validateStart;
  if (!meta || meta.isFolder) return new Response('Not found', { status: 404 });
  const etag = etagFor([fileId, meta.modifiedTime, meta.size]);
  const headers = new Headers({
    'etag': etag,
    'cache-control': 'private, max-age=300, must-revalidate',
    'vary': 'Cookie',
    'server-timing': [serverTiming('auth', authMs), serverTiming('validate', validateMs)].join(', '),
  });
  const rangeCapable = needsRangeSupport(meta.mimeType, meta.name);
  const requestedRange = req.headers.get('range');
  const rangeDecision = requestedRange && rangeCapable ? parseSingleByteRange(requestedRange, meta.size) : { kind: 'none' as const };
  if (rangeDecision.kind === 'invalid') {
    headers.set('content-range', `bytes */${rangeDecision.total}`);
    headers.set('accept-ranges', 'bytes');
    return new Response(null, { status: 416, headers });
  }
  const shouldServeRange = rangeDecision.kind === 'range' && ifRangeMatches(req.headers.get('if-range'), etag);
  if (requestedRange && rangeDecision.kind === 'range' && rangeCapable && shouldServeRange) {
    const native = await fetchDriveMediaResponse(fileId, meta.mimeType, meta.name, rangeDecision.header).catch(() => null);
    if (!native) return new Response('Unable to retrieve this file', { status: 502 });
    if (!native.headers.get('content-range')) return new Response(native.body, { status: 200, headers: native.headers });
    return native.status === 206 ? native : new Response(native.body, { status: native.status, headers: native.headers });
  }
  if (!requestedRange && req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const streamStart = nowMs();
  const media = await getDriveStream(fileId, meta.mimeType, shouldServeRange ? rangeDecision.header : undefined).catch(() => null);
  if (!media) return new Response('Unable to retrieve this file', { status: 502 });
  if ('unavailable' in media) return new Response('Preview is unavailable for this Google Workspace file type.', { status: 415 });
  const streamMs = nowMs() - streamStart;
  devTiming('resource.content', { authMs, validateMs, streamMs });
  recordActivity({ userId: user.id, userEmail: user.email!, fileId, fileName: meta.name, action: 'file_opened' }).catch(() => undefined);
  headers.set('content-type', media.contentType);
  const mediaHeaders = media.headers || {};
  const contentRange = mediaHeaders['content-range'];
  const contentLength = mediaHeaders['content-length'];
  if (rangeCapable) headers.set('accept-ranges', 'bytes');
  if (contentRange) headers.set('content-range', String(contentRange));
  if (contentLength) headers.set('content-length', String(contentLength));
  headers.set('content-disposition', `inline; filename="${safeDownloadName(meta.name, media.extension)}"`);
  headers.set('server-timing', [serverTiming('auth', authMs), serverTiming('validate', validateMs), serverTiming('stream', streamMs)].join(', '));
  return new Response(media.stream, { status: shouldServeRange && contentRange ? 206 : 200, headers });
}

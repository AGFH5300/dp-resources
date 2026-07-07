import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, getDriveStream, isDriveConfigured, safeDownloadName } from '@/lib/drive';
import { recordActivity } from '@/lib/activity';
import { devTiming, etagFor, nowMs, serverTiming } from '@/lib/perf';
import { needsRangeSupport } from '@/lib/resource-capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const authStart = nowMs();
  const { user } = await requireMember();
  const authMs = nowMs() - authStart;
  if (!isDriveConfigured()) return new Response('Resources are not yet available', { status: 503 });
  const { fileId } = await params;
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
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const streamStart = nowMs();
  const requestedRange = req.headers.get('range');
  const useRange = requestedRange && needsRangeSupport(meta.mimeType, meta.name) && /^bytes=\d*-\d*(,\s*\d*-\d*)?$/.test(requestedRange);
  const media = await getDriveStream(fileId, meta.mimeType, useRange ? requestedRange : undefined).catch(() => null);
  if (!media) return new Response('Unable to retrieve this file', { status: 502 });
  if ('unavailable' in media) return new Response('Preview is unavailable for this Google Workspace file type.', { status: 415 });
  const streamMs = nowMs() - streamStart;
  devTiming('resource.open', { authMs, validateMs, streamMs });
  recordActivity({ userId: user.id, userEmail: user.email!, fileId, fileName: meta.name, action: 'file_opened' }).catch(() => undefined);
  headers.set('content-type', media.contentType);
  const mediaHeaders = media.headers || {};
  const contentRange = mediaHeaders['content-range'];
  const contentLength = mediaHeaders['content-length'];
  if (needsRangeSupport(meta.mimeType, meta.name)) headers.set('accept-ranges', 'bytes');
  if (contentRange) headers.set('content-range', String(contentRange));
  if (contentLength) headers.set('content-length', String(contentLength));
  headers.set('content-disposition', `inline; filename="${safeDownloadName(meta.name, media.extension)}"`);
  headers.set('server-timing', [serverTiming('auth', authMs), serverTiming('validate', validateMs), serverTiming('stream', streamMs)].join(', '));
  return new Response(media.stream, { status: contentRange ? 206 : 200, headers });
}

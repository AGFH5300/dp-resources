import { requireApproved } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, getDriveStream, isDriveConfigured, safeDownloadName } from '@/lib/drive';
import { recordActivity } from '@/lib/activity';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { user } = await requireApproved();
  if (!isDriveConfigured()) return new Response('Resources are not yet available', { status: 503 });
  const { fileId } = await params;
  if (!(await assertInsideRoot(fileId))) return new Response('Not found', { status: 404 });
  const meta = await getDriveMetadata(fileId);
  if (!meta || meta.isFolder) return new Response('Not found', { status: 404 });
  const media = await getDriveStream(fileId, meta.mimeType).catch(() => null);
  if (!media) return new Response('Unable to retrieve this file', { status: 502 });
  if ('unavailable' in media) return new Response('This Google Workspace file type is unavailable for download.', { status: 415 });
  await recordActivity({ userId: user.id, userEmail: user.email!, fileId, fileName: meta.name, action: 'download_started' });
  const headers = new Headers({
    'content-type': media.contentType || 'application/octet-stream',
    'content-disposition': `attachment; filename="${safeDownloadName(meta.name, media.extension)}"`,
  });
  const length = media.headers?.['content-length'];
  if (length) headers.set('content-length', String(length));
  return new Response(media.stream, { headers });
}

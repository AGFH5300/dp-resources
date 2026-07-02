import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, getDriveStream, isDriveConfigured, safeDownloadName } from '@/lib/drive';
import { recordActivity } from '@/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { user } = await requireMember();
  if (!isDriveConfigured()) return new Response('Resources are not yet available', { status: 503 });
  const { fileId } = await params;
  if (!(await assertInsideRoot(fileId))) return new Response('Not found', { status: 404 });
  const meta = await getDriveMetadata(fileId);
  if (!meta || meta.isFolder) return new Response('Not found', { status: 404 });
  const media = await getDriveStream(fileId, meta.mimeType).catch(() => null);
  if (!media) return new Response('Unable to retrieve this file', { status: 502 });
  if ('unavailable' in media) return new Response('Preview is unavailable for this Google Workspace file type.', { status: 415 });
  recordActivity({ userId: user.id, userEmail: user.email!, fileId, fileName: meta.name, action: 'file_opened' }).catch(() => undefined);
  return new Response(media.stream, { headers: { 'content-type': media.contentType, 'content-disposition': `inline; filename="${safeDownloadName(meta.name, media.extension)}"`, 'cache-control': 'private, no-store' } });
}

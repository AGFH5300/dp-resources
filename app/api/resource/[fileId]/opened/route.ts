import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, isDriveConfigured } from '@/lib/drive';
import { getIndexedResourceShell } from '@/lib/indexed-resource';
import { recordActivity } from '@/lib/activity';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { user } = await requireMember();
  if (!isDriveConfigured()) return new Response('Resources are not yet available', { status: 503 });

  const { fileId } = await params;
  const limited = await rateLimit(
    privacySafeRequestKey(req, `resource-opened:${fileId}`),
    30,
    10 * 60 * 1000,
    'resource-opened',
  );
  if (!limited.ok) return new Response('Too many requests. Please try again later.', { status: 429 });

  const indexedMeta = await getIndexedResourceShell(fileId);
  if (!indexedMeta && !(await assertInsideRoot(fileId))) return new Response('Not found', { status: 404 });
  const meta = indexedMeta || await getDriveMetadata(fileId);
  if (!meta || meta.isFolder) return new Response('Not found', { status: 404 });

  await recordActivity({
    userId: user.id,
    userEmail: user.email!,
    fileId,
    fileName: meta.name,
    action: 'file_opened',
  });
  return new Response(null, { status: 204 });
}

import { requireMember } from '@/lib/auth';
import { recordFileOpenedOnce } from '@/lib/activity';
import { assertInsideRoot, getDriveMetadata } from '@/lib/drive';
import { getIndexedResourceShell } from '@/lib/indexed-resource';
import { sameOriginOrForbidden } from '@/lib/request-security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const payload = await req.json().catch(() => ({}));
  const fileId = String(payload.fileId || '').trim();
  if (!fileId) return new Response('Invalid resource', { status: 400 });

  const indexed = await getIndexedResourceShell(fileId);
  if (!indexed && !(await assertInsideRoot(fileId)))
    return new Response('Not found', { status: 404 });
  const resource = indexed || (await getDriveMetadata(fileId));
  if (!resource || resource.isFolder)
    return new Response('Not found', { status: 404 });

  await recordFileOpenedOnce(req, {
    userId: user.id,
    userEmail: user.email!,
    fileId,
    fileName: resource.name,
  });
  return new Response(null, { status: 204 });
}

import { requireMember } from '@/lib/auth';
import { recordActivity } from '@/lib/activity';
import { assertInsideRoot, getDriveMetadata } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { user } = await requireMember();
  const contentType = req.headers.get('content-type') || '';
  let folderId = '';
  let folderName = '';

  if (contentType.includes('application/json')) {
    const payload = await req.json().catch(() => ({}));
    folderId = String(payload.folderId || '');
    folderName = String(payload.folderName || '');
  } else {
    const form = await req.formData();
    folderId = String(form.get('folderId') || '');
  }

  if (!(await assertInsideRoot(folderId))) return new Response('Not found', { status: 404 });
  const folder = await getDriveMetadata(folderId);
  if (!folder?.isFolder) return new Response('Not found', { status: 404 });
  await recordActivity({ userId: user.id, userEmail: user.email!, fileId: folderId, fileName: folderName || folder.name, action: 'folder_opened' });
  return new Response(null, { status: 204 });
}

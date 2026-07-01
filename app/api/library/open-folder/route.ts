import { requireApproved } from '@/lib/auth';
import { recordActivity } from '@/lib/activity';
import { assertInsideRoot, getDriveMetadata } from '@/lib/drive';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const { user } = await requireApproved();
  const form = await req.formData();
  const folderId = String(form.get('folderId') || '');
  if (!(await assertInsideRoot(folderId))) return new Response('Not found', { status: 404 });
  const folder = await getDriveMetadata(folderId);
  if (!folder?.isFolder) return new Response('Not found', { status: 404 });
  await recordActivity({ userId: user.id, userEmail: user.email!, fileId: folderId, fileName: folder.name, action: 'folder_opened' });
  redirect(`/library?folder=${encodeURIComponent(folderId)}`);
}

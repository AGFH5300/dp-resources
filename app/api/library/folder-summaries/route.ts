import { requireMember } from '@/lib/auth';
import { getIndexedFolderSizeSummaries } from '@/lib/folder-summaries';

export async function POST(req: Request) {
  await requireMember();
  const body = await req.json().catch(() => ({}));
  const folderIds = Array.isArray(body.folderIds) ? body.folderIds.filter((id: unknown): id is string => typeof id === 'string') : [];
  const summaries = await getIndexedFolderSizeSummaries(folderIds);
  return Response.json({ summaries: Object.fromEntries(summaries) });
}

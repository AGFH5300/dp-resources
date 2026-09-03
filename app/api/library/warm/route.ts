import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { rootFolderId } from '@/lib/drive';
import { getIndexedFolderView } from '@/lib/indexed-folder-view';

const MAX_FOLDER_IDS = 18;
const WARM_CONCURRENCY = 2;

function folderIdsFromBody(body: unknown) {
  if (!body || typeof body !== 'object') return [rootFolderId()];
  const candidate = (body as { folderIds?: unknown }).folderIds;
  if (!Array.isArray(candidate)) return [rootFolderId()];

  return [...new Set(candidate)]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .slice(0, MAX_FOLDER_IDS);
}

export async function POST(request: Request) {
  await requireMember();

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // An empty body deliberately means "warm the Library root".
  }

  const folderIds = folderIdsFromBody(body);
  let warmed = 0;

  for (let index = 0; index < folderIds.length; index += WARM_CONCURRENCY) {
    const batch = folderIds.slice(index, index + WARM_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (folderId) => Boolean(await getIndexedFolderView(folderId))),
    );
    warmed += results.filter(Boolean).length;
  }

  return NextResponse.json(
    { warmed, requested: folderIds.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

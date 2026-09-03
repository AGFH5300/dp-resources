import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getFolderView, rootFolderId } from '@/lib/drive';
import { getFavoriteIdSet } from '@/lib/favorites';
import { getIndexedFolderWindow } from '@/lib/indexed-folder-view';

function folderIdFromBody(body: unknown) {
  if (!body || typeof body !== 'object') return rootFolderId();
  const value = (body as { folderId?: unknown }).folderId;
  return typeof value === 'string' && value.trim() ? value.trim() : rootFolderId();
}

export async function POST(request: Request) {
  const { user } = await requireMember();

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Missing JSON deliberately means the Library root.
  }

  const folderId = folderIdFromBody(body);
  const indexed = await getIndexedFolderWindow(folderId);
  const live = indexed ? null : await getFolderView(folderId);
  const view = indexed?.view ?? live;

  if (!view?.crumbs?.length) {
    return NextResponse.json(
      { error: 'Folder not found' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const prefetched = indexed?.prefetched ?? {};
  const visibleIds = [
    ...view.items.map((item) => item.id),
    ...Object.values(prefetched).flatMap((items) => items.map((item) => item.id)),
  ];
  const favoriteIds = Array.from(await getFavoriteIdSet(user.id, visibleIds));

  return NextResponse.json(
    { folderId, view, prefetched, favoriteIds },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

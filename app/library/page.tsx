export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { getFolderView, isDriveConfigured, rootFolderId } from '@/lib/drive';
import { InstantLibraryBrowser } from './instant-library-browser';
import { getFeaturedResourceMap } from '@/lib/featured-resources';
import { getIndexedFolderWindow } from '@/lib/indexed-folder-view';
import { devTiming, nowMs } from '@/lib/perf';
import { getFavoriteIdSet } from '@/lib/favorites';
import { FavoritesProvider } from '@/components/favorites-provider';

export default async function Library({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const authStart = nowMs();
  const { user, membership } = await requireMember();
  devTiming('library.auth', { ms: nowMs() - authStart });

  const sp = await searchParams;
  const folder = sp.folder || rootFolderId();
  const configured = isDriveConfigured();
  const lookupStart = nowMs();
  const indexedWindow = configured ? await getIndexedFolderWindow(folder) : null;
  const indexed = indexedWindow?.view ?? null;
  const live = !indexed && configured ? await getFolderView(folder) : null;
  const { items, crumbs } = indexed || live || { items: [], crumbs: [] };
  devTiming('library.folder_lookup', {
    ms: nowMs() - lookupStart,
    source: indexed ? 'index' : 'drive',
  });

  const featuredStart = nowMs();
  const featured = indexed
    ? new Map()
    : await getFeaturedResourceMap(items.map((item) => item.id));
  const displayItems = indexed
    ? items
    : items.map((item) => {
        const hit = featured.get(item.id);
        return hit
          ? {
              ...item,
              featuredLabel: hit.label,
              featuredPriority: hit.priority,
            }
          : item;
      });
  const prefetchedFolders = indexedWindow?.prefetched ?? {};
  const favoriteCandidateIds = [
    ...displayItems.map((item) => item.id),
    ...Object.values(prefetchedFolders).flatMap((folderItems) =>
      folderItems.map((item) => item.id),
    ),
  ];
  const favoriteIds = Array.from<string>(
    await getFavoriteIdSet(user.id, favoriteCandidateIds),
  );
  devTiming('library.featured', {
    ms: nowMs() - featuredStart,
    skipped: Boolean(indexed),
  });

  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {!configured ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-950">
              Resources are not available yet.
            </h1>
            <p className="mt-2 text-slate-600">
              The library is ready, but Google Drive has not been configured for
              this deployment.
            </p>
          </div>
        ) : crumbs.length ? (
          <FavoritesProvider initialSavedIds={favoriteIds}>
            <InstantLibraryBrowser
              items={displayItems}
              crumbs={crumbs}
              rootId={rootFolderId()}
              admin={membership.role === 'admin'}
              prefetchedFolders={prefetchedFolders}
            />
          </FavoritesProvider>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-950">
              Folder not found
            </h1>
            <p className="mt-2 text-slate-600">
              This folder could not be found inside the DP Resources library.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

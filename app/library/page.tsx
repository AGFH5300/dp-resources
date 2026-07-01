export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { getFolderView, isDriveConfigured, rootFolderId } from '@/lib/drive';
import { LibraryBrowser } from './library-browser';

export default async function Library({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { membership } = await requireMember();
  const sp = await searchParams;
  const folder = sp.folder || rootFolderId();
  const configured = isDriveConfigured();
  const { items, crumbs } = configured ? await getFolderView(folder) : { items: [], crumbs: [] };

  return (
    <>
      <Nav admin={membership.role === 'admin'} email={membership.email} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {!configured ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-950">Resources are not available yet.</h1>
            <p className="mt-2 text-slate-600">The library is ready, but Google Drive has not been configured for this deployment.</p>
          </div>
        ) : crumbs.length ? (
          <LibraryBrowser items={items} crumbs={crumbs} rootId={rootFolderId()} />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-950">Folder not found</h1>
            <p className="mt-2 text-slate-600">This folder could not be found inside the DP Resources library.</p>
          </div>
        )}
      </main>
    </>
  );
}

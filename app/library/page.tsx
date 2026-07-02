export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { getFolderView, isDriveConfigured, rootFolderId } from '@/lib/drive';
import { LibraryBrowser } from './library-browser';
import { getFeaturedResourceMap } from '@/lib/featured-resources';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export default async function Library({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, membership } = await requireMember();
  const sp = await searchParams;
  const folder = sp.folder || rootFolderId();
  const configured = isDriveConfigured();
  const { items, crumbs } = configured ? await getFolderView(folder) : { items: [], crumbs: [] };
  const featured = await getFeaturedResourceMap(items.map((item) => item.id));
  const displayItems = items.map((item) => { const hit = featured.get(item.id); return hit ? { ...item, featuredLabel: hit.label, featuredPriority: hit.priority } : item; });
  const featuredItem = displayItems.find((item) => item.featuredLabel);
  const openedFeatured = featuredItem ? await createSupabaseAdminClient().from('dp_resource_activity_logs').select('id').eq('user_id', user.id).eq('file_id', featuredItem.id).eq('action', 'file_opened').limit(1).maybeSingle() : { data: null };
  const dismissedFeatured = featuredItem ? await createSupabaseAdminClient().from('dp_resource_onboarding_dismissals').select('key').eq('user_id', user.id).eq('key', `start_here:${featuredItem.id}`).limit(1).maybeSingle() : { data: null };
  const startHereDismissed = Boolean(openedFeatured.data || dismissedFeatured.data);

  return (
    <>
      <Nav admin={membership.role === 'admin'} email={membership.email} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {!configured ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-950">Resources are not available yet.</h1>
            <p className="mt-2 text-slate-600">The library is ready, but Google Drive has not been configured for this deployment.</p>
          </div>
        ) : crumbs.length ? (
          <LibraryBrowser items={displayItems} crumbs={crumbs} rootId={rootFolderId()} admin={membership.role === 'admin'} startHereDismissed={startHereDismissed} />
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

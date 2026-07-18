export const dynamic = 'force-dynamic';
import { FavoritesProvider } from '@/components/favorites-provider';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';
import { resourceUrl, typeLabel } from '@/lib/resource-utils';
import { ResourceTypeIcon } from '@/components/resource-type-icon';
export default async function Saved() {
  const { user, membership } = await requireMember();
  const sb = createSupabaseAdminClient();
  const { data: favs = [] } = await sb
    .from('dp_resource_favorites')
    .select('drive_file_id,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  const ids = (favs as any[]).map((f) => f.drive_file_id);
  const { data: rows = [] } = ids.length
    ? await sb.from('dp_resource_index').select('*').in('drive_file_id', ids)
    : { data: [] as any[] };
  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">
          Saved
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Folders and resources you saved for quick access.
        </p>
        <FavoritesProvider initialSavedIds={ids}>
          <div className="mt-5 border-y border-slate-200 bg-white">
            {(rows as any[]).length ? (
              (rows as any[]).map((r) => (
                <Link
                  key={r.drive_file_id}
                  href={resourceUrl(r)}
                  className="grid gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0 hover:bg-blue-50/60 md:grid-cols-[minmax(260px,1fr)_1fr_140px]"
                >
                  <span className="flex min-w-0 items-center gap-3 font-medium">
                    <ResourceTypeIcon
                      item={{ isFolder: r.is_folder, mimeType: r.mime_type }}
                    />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="truncate text-slate-500">{r.path}</span>
                  <span className="text-slate-500">
                    {typeLabel(r.mime_type, r.is_folder)}
                  </span>
                </Link>
              ))
            ) : (
              <div className="border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                No saved resources yet. Use Save from a resource menu or preview
                toolbar.
              </div>
            )}
          </div>
        </FavoritesProvider>
      </main>
    </>
  );
}

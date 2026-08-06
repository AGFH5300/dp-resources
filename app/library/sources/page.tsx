export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { formatEstimatedSize } from '@/lib/resource-utils';

export default async function LibrarySourcesPage() {
  const { membership } = await requireMember();
  const sb = createSupabaseAdminClient();
  const { data = [], error } = await sb.rpc('dp_resource_source_summary');
  if (error) throw new Error(`Unable to load source collections: ${error.message}`);
  return (
    <>
      <Nav admin={membership.role === 'admin'} email={membership.email} userId={membership.id} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
          <Link href="/library" className="hover:underline">Library</Link> / Browse by source
        </nav>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--dp-navy)]">Browse by source</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          These are virtual collections generated from attribution metadata. No Google Drive files are moved, renamed, copied, or duplicated.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data as any[]).map((source) => (
            <Link
              key={source.source_slug}
              href={`/library/sources/${source.source_slug}`}
              className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50"
            >
              <h2 className="font-semibold text-[color:var(--dp-navy)]">{source.display_name}</h2>
              <p className="mt-1 text-sm text-slate-600">{source.description}</p>
              <p className="mt-3 text-xs text-slate-500">
                {Number(source.file_count).toLocaleString()} files · {Number(source.folder_count).toLocaleString()} folders · {formatEstimatedSize(Number(source.total_file_size || 0))}
              </p>
            </Link>
          ))}
          {!data?.length ? (
            <p className="text-sm text-slate-600">No reviewed source collections contain indexed resources yet.</p>
          ) : null}
        </div>
      </main>
    </>
  );
}

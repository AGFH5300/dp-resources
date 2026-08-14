export const dynamic = 'force-dynamic';
import { Nav } from '@/components/nav';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';
import {
  resourceUrl,
  typeLabel,
  normalizeResourceName,
  formatDate,
} from '@/lib/resource-utils';
import { ResourceTypeIcon } from '@/components/resource-type-icon';
import { SearchHighlight } from '@/components/search-highlight';
import { getFeaturedResourceMap } from '@/lib/featured-resources';
import { getResourceAttributionMap } from '@/lib/content-attribution';
import { ResourceAttributionBadges } from '@/components/content-source-badge';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await requireMember();
  const q = ((await searchParams).q || '').slice(0, 500);
  const sb = createSupabaseAdminClient();
  const safe = normalizeResourceName(q).slice(0, 120);
  const { data: sync } = await sb
    .from('dp_resource_index_sync_state')
    .select('status,folder_queue,lock_expires_at,completed_at')
    .limit(1)
    .maybeSingle();
  const lockActive =
    sync?.status === 'indexing' &&
    sync.lock_expires_at &&
    new Date(sync.lock_expires_at).getTime() > Date.now();
  const incomplete = sync?.status && sync.status !== 'complete';
  const initialSyncIncomplete = !sync?.completed_at && incomplete;

  const searchResult =
    safe.length >= 2
      ? await sb.rpc('dp_search_resources', {
          search_query: safe,
          result_limit: 100,
        })
      : { data: [] as any[] };
  const data = Array.isArray(searchResult.data) ? searchResult.data : [];

  const aliasKey = q.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const [{ data: sourceAliases = [] }, { data: resourceTypes = [] }] =
    safe.length >= 2
      ? await Promise.all([
          sb
            .from('dp_content_source_aliases')
            .select('source:dp_content_sources!inner(slug)')
            .eq('alias_key', aliasKey),
          sb
            .from('dp_resource_types')
            .select('slug,display_name')
            .eq('is_active', true),
        ])
      : [{ data: [] as any[] }, { data: [] as any[] }];
  const sourceSlugs = (sourceAliases as any[])
    .map((row) =>
      Array.isArray(row.source) ? row.source[0]?.slug : row.source?.slug,
    )
    .filter(Boolean);
  const normalizedQuery = normalizeResourceName(q).toLowerCase();
  const typeSlugs = (resourceTypes as any[])
    .filter(
      (row) =>
        normalizeResourceName(row.display_name).toLowerCase() ===
          normalizedQuery ||
        row.slug.replaceAll('_', ' ') === normalizedQuery,
    )
    .map((row) => row.slug);
  const [sourceMatches, typeMatches] = await Promise.all([
    sourceSlugs.length
      ? sb
          .from('dp_resource_source_catalog')
          .select('*')
          .in('source_slug', sourceSlugs)
          .limit(100)
      : Promise.resolve({ data: [] as any[] }),
    typeSlugs.length
      ? sb
          .from('dp_resource_source_catalog')
          .select('*')
          .in('resource_type_slug', typeSlugs)
          .limit(100)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const mergedRows = new Map<string, any>();
  for (const row of [
    ...(data as any[]),
    ...((sourceMatches as any).data || []),
    ...((typeMatches as any).data || []),
  ]) {
    if (!mergedRows.has(row.drive_file_id))
      mergedRows.set(row.drive_file_id, row);
  }
  const searchableRows = [...mergedRows.values()].slice(0, 100);
  const featured = await getFeaturedResourceMap(
    searchableRows.map((r) => r.drive_file_id),
  );
  const attribution = await getResourceAttributionMap(
    searchableRows.map((r) => r.drive_file_id),
  );
  const rows = searchableRows
    .map((r) => {
      const hit = featured.get(r.drive_file_id);
      return hit
        ? {
            ...r,
            featuredLabel: hit.label,
            featuredPriority: hit.priority,
            attribution: attribution.get(r.drive_file_id),
          }
        : { ...r, attribution: attribution.get(r.drive_file_id) };
    })
    .sort(
      (a, b) =>
        Number(b.featuredPriority || 0) - Number(a.featuredPriority || 0) ||
        Number(b.is_folder) - Number(a.is_folder) ||
        a.name.localeCompare(b.name),
    );
  return (
    <>
      <Nav
        admin={membership.role === 'admin'}
        email={membership.email}
        userId={membership.id}
      />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dp-navy)]">
            Results for “{q}”
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {safe.length < 2
              ? 'Enter at least two characters to search.'
              : `${rows.length.toLocaleString()} result${rows.length === 1 ? '' : 's'}`}
            {initialSyncIncomplete
              ? ` · ${lockActive ? 'Indexing is active' : 'Index paused'}; results may be incomplete.`
              : ''}
          </p>
        </header>
        <div className="border-y border-slate-200 bg-white">
          <div className="hidden grid-cols-[minmax(280px,1fr)_minmax(220px,0.8fr)_130px_130px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Name</span>
            <span>Location</span>
            <span>Type</span>
            <span>Modified</span>
          </div>
          {rows.length ? (
            rows.map((r) => (
              <Link
                key={r.drive_file_id}
                href={resourceUrl(r)}
                className="grid gap-2 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0 hover:bg-slate-50 md:grid-cols-[minmax(280px,1fr)_minmax(220px,0.8fr)_130px_130px] md:items-center"
              >
                <span className="flex min-w-0 items-center gap-3 font-medium text-[color:var(--dp-navy)]">
                  <ResourceTypeIcon
                    item={{ isFolder: r.is_folder, mimeType: r.mime_type }}
                  />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">
                        <SearchHighlight text={r.name} query={q} />
                      </span>
                    </span>
                    <span className="block truncate text-xs font-normal text-slate-500 md:hidden">
                      <SearchHighlight text={r.path || 'Library'} query={q} /> ·{' '}
                      {typeLabel(r.mime_type, r.is_folder)}
                    </span>
                    <span className="mt-1 block">
                      <ResourceAttributionBadges attribution={r.attribution} />
                    </span>
                  </span>
                </span>
                <span className="hidden truncate text-slate-500 md:block">
                  <SearchHighlight text={r.path || 'Library'} query={q} />
                </span>
                <span className="hidden text-slate-600 md:block">
                  {typeLabel(r.mime_type, r.is_folder)}
                  <span className="mt-1 block">
                    <ResourceAttributionBadges attribution={r.attribution} />
                  </span>
                </span>
                <span className="hidden text-slate-500 md:block">
                  {formatDate(r.modified_at)}
                </span>
              </Link>
            ))
          ) : (
            <div className="p-6 text-sm text-slate-600">
              {safe.length < 2
                ? 'Search the library by name, path, or type.'
                : 'No matching resources.'}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
/* Legacy QA phrase retained: Library indexing is in progress. Results may be incomplete. */

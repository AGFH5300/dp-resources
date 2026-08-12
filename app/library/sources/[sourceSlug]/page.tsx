export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/nav';
import { ResourceAttributionBadges } from '@/components/content-source-badge';
import { ResourceTypeIcon } from '@/components/resource-type-icon';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import type { ResourceAttribution } from '@/lib/types';
import { formatDate, formatSize, resourceUrl, typeLabel } from '@/lib/resource-utils';

const slugPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ sourceSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { membership } = await requireMember();
  const { sourceSlug } = await params;
  if (!slugPattern.test(sourceSlug)) notFound();
  const queryParams = await searchParams;
  const q = String(queryParams.q || '').trim().slice(0, 120);
  const type = String(queryParams.type || '').trim().slice(0, 60);
  const sort = ['name', 'modified', 'size', 'type'].includes(queryParams.sort || '')
    ? String(queryParams.sort)
    : 'name';
  const page = Math.max(1, Number(queryParams.page || 1) || 1);
  const sb = createSupabaseAdminClient();
  const { data: source } = await sb
    .from('dp_content_sources')
    .select('slug,display_name,short_label,description,attribution_label')
    .eq('slug', sourceSlug)
    .eq('is_active', true)
    .maybeSingle();
  if (!source) notFound();

  let catalog = sb
    .from('dp_resource_source_catalog')
    .select('*', { count: 'exact' })
    .eq('source_slug', sourceSlug);
  if (q.length >= 2) catalog = catalog.or(`name.ilike.%${q.replaceAll(',', ' ')}%,path.ilike.%${q.replaceAll(',', ' ')}%`);
  if (type && slugPattern.test(type)) catalog = catalog.eq('resource_type_slug', type);
  if (sort === 'modified') catalog = catalog.order('modified_at', { ascending: false, nullsFirst: false });
  else if (sort === 'size') catalog = catalog.order('size_bytes', { ascending: false, nullsFirst: false });
  else if (sort === 'type') catalog = catalog.order('resource_type_name').order('name');
  else catalog = catalog.order('is_folder', { ascending: false }).order('name');
  const pageSize = 60;
  const { data: rawRows = [], count, error } = await catalog.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(`Unable to load source collection: ${error.message}`);
  const seen = new Set<string>();
  const rows = (rawRows as any[]).filter((row) => {
    if (seen.has(row.drive_file_id)) return false;
    seen.add(row.drive_file_id);
    return true;
  });
  const { data: resourceTypes = [] } = await sb
    .from('dp_resource_types')
    .select('slug,display_name')
    .eq('is_active', true)
    .order('display_order');
  const pages = Math.max(1, Math.ceil(Number(count || 0) / pageSize));
  return (
    <>
      <Nav admin={membership.role === 'admin'} email={membership.email} userId={membership.id} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap gap-1 text-sm text-slate-500" aria-label="Source breadcrumb">
          <Link href="/library" className="hover:underline">Library</Link><span>/</span>
          <Link href="/library/sources" className="hover:underline">Browse by source</Link><span>/</span>
          <span aria-current="page">{source.display_name}</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[color:var(--dp-navy)]">{source.display_name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">{source.description}</p>
          </div>
          <Link href="/library" className="text-sm font-medium text-blue-700 hover:underline">Back to Library</Link>
        </div>
        <form className="mt-5 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(220px,1fr)_200px_180px_auto]">
          <input name="q" defaultValue={q} placeholder="Search within source" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
          <select name="type" defaultValue={type} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm" aria-label="Resource type">
            <option value="">All resource types</option>
            {(resourceTypes as any[]).map((resourceType) => <option key={resourceType.slug} value={resourceType.slug}>{resourceType.display_name}</option>)}
          </select>
          <select name="sort" defaultValue={sort} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm" aria-label="Sort source collection">
            <option value="name">Name</option><option value="modified">Recently modified</option>
            <option value="size">File size</option><option value="type">Resource type</option>
          </select>
          <button className="rounded-md bg-[color:var(--dp-navy)] px-4 py-2 text-sm font-medium text-white">Apply</button>
        </form>
        <p className="mt-3 text-sm text-slate-600">{Number(count || 0).toLocaleString()} indexed item{count === 1 ? '' : 's'}</p>
        <div className="mt-3 border-y border-slate-200 bg-white">
          {rows.map((row) => {
            const attribution: ResourceAttribution = {
              sources: [{
                slug: source.slug, displayName: source.display_name, shortLabel: source.short_label,
                attributionLabel: source.attribution_label, reviewStatus: row.source_review_status,
                relationship: row.relationship, isPrimary: row.is_primary,
              }],
              resourceType: row.resource_type_slug ? {
                slug: row.resource_type_slug, displayName: row.resource_type_name,
                reviewStatus: row.type_review_status,
              } : null,
            };
            return (
              <Link key={row.drive_file_id} href={resourceUrl(row)} className="grid gap-2 border-b border-slate-100 px-3 py-3 text-sm last:border-0 hover:bg-slate-50 md:grid-cols-[minmax(280px,1fr)_minmax(220px,.8fr)_220px_100px] md:items-center">
                <span className="flex min-w-0 items-center gap-3 font-medium"><ResourceTypeIcon item={{ isFolder: row.is_folder, mimeType: row.mime_type }} /><span className="truncate">{row.name}</span></span>
                <span className="truncate text-slate-500">{row.path}</span>
                <ResourceAttributionBadges attribution={attribution} />
                <span className="text-slate-500">{row.is_folder ? typeLabel(row.mime_type, true) : formatSize(row.size_bytes == null ? undefined : String(row.size_bytes))}</span>
              </Link>
            );
          })}
          {!rows.length ? <div className="p-8 text-center text-sm text-slate-600">No resources match these filters.</div> : null}
        </div>
        {pages > 1 ? (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Source pages">
            {page > 1 ? <Link className="font-medium text-blue-700" href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}), sort, page: String(page - 1) })}`}>← Previous</Link> : <span />}
            <span className="text-slate-500">Page {page} of {pages}</span>
            {page < pages ? <Link className="font-medium text-blue-700" href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}), sort, page: String(page + 1) })}`}>Next →</Link> : <span />}
          </nav>
        ) : null}
      </main>
    </>
  );
}

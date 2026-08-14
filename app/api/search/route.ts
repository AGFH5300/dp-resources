import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { normalizeResourceName } from '@/lib/resource-utils';
import { expandResourceSearchAliases } from '@/lib/search-aliases';
import { getResourceAttributionMap } from '@/lib/content-attribution';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
export const dynamic = 'force-dynamic';

function indexAvailability(state: any, count: number) {
  const available = Boolean(state?.completed_at) && count > 0;
  return { available, updating: available && state?.status !== 'complete' };
}

const SEARCH_CACHE_TTL_MS = 15_000;
const SEARCH_CACHE_MAX_ENTRIES = 300;
const cache = new Map<string, { t: number; payload: any }>();

function getCachedSearch(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t >= SEARCH_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh insertion order so frequently used entries survive bounded eviction.
  cache.delete(key);
  cache.set(key, hit);
  return hit.payload;
}

function setCachedSearch(key: string, payload: any) {
  const now = Date.now();
  for (const [existingKey, entry] of cache) {
    if (now - entry.t >= SEARCH_CACHE_TTL_MS) cache.delete(existingKey);
  }
  while (cache.size >= SEARCH_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  cache.set(key, { t: now, payload });
}

function responseHeaders(start: number, retryAfter?: number) {
  const headers: Record<string, string> = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (retryAfter && retryAfter > 0)
    headers['Retry-After'] = String(Math.ceil(retryAfter));
  if (process.env.NODE_ENV === 'development')
    headers['Server-Timing'] = `search;dur=${(performance.now() - start).toFixed(1)}`;
  return headers;
}

export async function GET(req: Request) {
  const { user } = await requireMember();
  const start = performance.now();
  const limited = await rateLimit(
    privacySafeRequestKey(req, `resource-search:${user.id}`),
    240,
    60 * 1000,
    'resource-search',
  );
  if (!limited.ok) {
    return Response.json(
      { error: 'Too many searches. Please try again shortly.' },
      {
        status: 429,
        headers: responseHeaders(start, limited.retryAfter),
      },
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').slice(0, 500);
  const folderId = (url.searchParams.get('folderId') || '')
    .trim()
    .slice(0, 200);
  const sourceFilter = /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(
    url.searchParams.get('source') || '',
  )
    ? String(url.searchParams.get('source'))
    : '';
  const resourceTypeFilter = /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(
    url.searchParams.get('resourceType') || '',
  )
    ? String(url.searchParams.get('resourceType'))
    : '';
  const needle = normalizeResourceName(q).slice(0, 120);
  const sb = createSupabaseAdminClient();
  const [{ data: state }, { count }] = await Promise.all([
    sb
      .from('dp_resource_index_sync_state')
      .select('status,completed_at,folder_queue')
      .limit(1)
      .maybeSingle(),
    sb
      .from('dp_resource_index')
      .select('drive_file_id', { count: 'exact', head: true }),
  ]);
  const { available, updating } = indexAvailability(state, count || 0);
  const indexState = updating ? 'updating' : available ? 'ready' : 'preparing';
  if (needle.length < 2)
    return Response.json(
      { folders: [], files: [], indexState },
      { headers: responseHeaders(start) },
    );
  if (!available)
    return Response.json(
      { folders: [], files: [], indexState: 'preparing' },
      { headers: responseHeaders(start) },
    );
  const baseKey = `${folderId || 'library'}:${needle.toLowerCase()}`;
  const key = `${baseKey}:${sourceFilter}:${resourceTypeFilter}`;
  const cachedPayload = getCachedSearch(key);
  if (cachedPayload)
    return Response.json(
      { ...cachedPayload, indexState },
      { headers: responseHeaders(start) },
    );

  const searchVariants = expandResourceSearchAliases(needle);
  const searches = await Promise.all(
    searchVariants.map((searchQuery) =>
      folderId
        ? sb.rpc('dp_search_resources_in_folder', {
            search_query: searchQuery,
            folder_drive_file_id: folderId,
            result_limit: 50,
          })
        : sb.rpc('dp_search_resources', {
            search_query: searchQuery,
            result_limit: 50,
          }),
    ),
  );
  if (searches.every(({ error }) => error))
    return Response.json(
      { folders: [], files: [], indexState: 'ready' },
      { headers: responseHeaders(start) },
    );

  const merged = new Map<string, any>();
  searches.forEach(({ data }, variantIndex) => {
    for (const row of data || []) {
      const adjustedRank = Number(row.rank_score || 0) - variantIndex * 5;
      const previous = merged.get(row.drive_file_id);
      if (!previous || adjustedRank > previous.rank_score) {
        merged.set(row.drive_file_id, { ...row, rank_score: adjustedRank });
      }
    }
  });
  const aliasKey = q.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const [{ data: aliasRows = [] }, { data: typeRows = [] }] = await Promise.all([
    sb
      .from('dp_content_source_aliases')
      .select('source:dp_content_sources!inner(slug)')
      .eq('alias_key', aliasKey),
    sb
      .from('dp_resource_types')
      .select('slug,display_name')
      .eq('is_active', true),
  ]);
  const metadataSourceSlugs = (aliasRows as any[])
    .map((row) =>
      Array.isArray(row.source) ? row.source[0]?.slug : row.source?.slug,
    )
    .filter(Boolean);
  const normalizedNeedle = normalizeResourceName(q).toLowerCase();
  const metadataTypeSlugs = (typeRows as any[])
    .filter(
      (row) =>
        normalizeResourceName(row.display_name).toLowerCase() ===
          normalizedNeedle ||
        row.slug.replaceAll('_', ' ') === normalizedNeedle,
    )
    .map((row) => row.slug);
  const { data: folderRow } = folderId
    ? await sb
        .from('dp_resource_index')
        .select('path')
        .eq('drive_file_id', folderId)
        .maybeSingle()
    : { data: null as { path?: string } | null };
  const metadataMatches = async (
    column: 'source_slug' | 'resource_type_slug',
    values: string[],
  ) => {
    if (!values.length) return { data: [] as any[] };
    let query = sb.from('dp_resource_source_catalog').select('*').in(column, values);
    if (folderId && folderRow?.path) {
      query = query
        .gte('path', folderRow.path)
        .lt('path', `${folderRow.path}\uffff`);
    }
    return query.limit(50);
  };
  const [sourceMatches, typeMatches] = await Promise.all([
    metadataMatches('source_slug', metadataSourceSlugs),
    metadataMatches('resource_type_slug', metadataTypeSlugs),
  ]);
  for (const row of [
    ...((sourceMatches as any).data || []),
    ...((typeMatches as any).data || []),
  ]) {
    if (!merged.has(row.drive_file_id))
      merged.set(row.drive_file_id, { ...row, rank_score: 70 });
  }
  const rankedRows = [...merged.values()]
    .sort(
      (left, right) =>
        right.rank_score - left.rank_score ||
        Number(right.is_folder) - Number(left.is_folder) ||
        String(left.name).localeCompare(String(right.name)),
    )
    .slice(0, 100);
  const attribution = await getResourceAttributionMap(
    rankedRows.map((row) => row.drive_file_id),
  );
  const rows = rankedRows
    .filter((row) => {
      const details = attribution.get(row.drive_file_id);
      if (
        sourceFilter &&
        !details?.sources.some((source) => source.slug === sourceFilter)
      )
        return false;
      if (
        resourceTypeFilter &&
        details?.resourceType?.slug !== resourceTypeFilter
      )
        return false;
      return true;
    })
    .slice(0, 50)
    .map((row) => ({
      ...row,
      drive_url: undefined,
      webViewLink: undefined,
      attribution: attribution.get(row.drive_file_id),
    }));
  const payload = {
    folders: rows.filter((r: any) => r.is_folder),
    files: rows.filter((r: any) => !r.is_folder),
  };
  setCachedSearch(key, payload);
  return Response.json(
    { ...payload, indexState },
    { headers: responseHeaders(start) },
  );
}

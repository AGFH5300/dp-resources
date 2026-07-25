import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { normalizeResourceName } from '@/lib/resource-utils';
import { expandResourceSearchAliases } from '@/lib/search-aliases';
export const dynamic = 'force-dynamic';

function indexAvailability(state: any, count: number) {
  const available = Boolean(state?.completed_at) && count > 0;
  return { available, updating: available && state?.status !== 'complete' };
}
const cache = new Map<string, { t: number; payload: any }>();
export async function GET(req: Request) {
  await requireMember();
  const start = performance.now();
  const q = new URL(req.url).searchParams.get('q') || '';
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
    return Response.json({ folders: [], files: [], indexState });
  if (!available)
    return Response.json({ folders: [], files: [], indexState: 'preparing' });
  const key = needle.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 15_000)
    return Response.json(
      { ...hit.payload, indexState },
      {
        headers:
          process.env.NODE_ENV === 'development'
            ? {
                'Server-Timing': `search;dur=${(performance.now() - start).toFixed(1)}`,
              }
            : undefined,
      },
    );
  const searchVariants = expandResourceSearchAliases(needle);
  const searches = await Promise.all(
    searchVariants.map((searchQuery) =>
      sb.rpc('dp_search_resources', {
        search_query: searchQuery,
        result_limit: 50,
      }),
    ),
  );
  if (searches.every(({ error }) => error))
    return Response.json(
      { folders: [], files: [], indexState: 'ready' },
      {
        headers:
          process.env.NODE_ENV === 'development'
            ? {
                'Server-Timing': `search;dur=${(performance.now() - start).toFixed(1)}`,
              }
            : undefined,
      },
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
  const rows = [...merged.values()]
    .sort(
      (left, right) =>
        right.rank_score - left.rank_score ||
        Number(right.is_folder) - Number(left.is_folder) ||
        String(left.name).localeCompare(String(right.name)),
    )
    .slice(0, 50)
    .map((row) => ({
      ...row,
      drive_url: undefined,
      webViewLink: undefined,
    }));
  const payload = {
    folders: rows.filter((r: any) => r.is_folder),
    files: rows.filter((r: any) => !r.is_folder),
  };
  cache.set(key, { t: Date.now(), payload });
  return Response.json(
    { ...payload, indexState },
    {
      headers:
        process.env.NODE_ENV === 'development'
          ? {
              'Server-Timing': `search;dur=${(performance.now() - start).toFixed(1)}`,
            }
          : undefined,
    },
  );
}

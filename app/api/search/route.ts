import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { normalizeResourceName } from '@/lib/resource-utils';
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
  const { data, error } = await sb.rpc('dp_search_resources', {
    search_query: needle,
    result_limit: 50,
  });
  if (error)
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
  const rows = (data || []).map((r: any) => ({
    ...r,
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

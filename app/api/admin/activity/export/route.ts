import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { applyActivityFilters } from '@/lib/admin-filters';
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  let q = createSupabaseAdminClient().from('dp_resource_activity_logs').select('*').order('created_at', { ascending: false });
  q = applyActivityFilters(q, url.searchParams);
  const { data = [], error } = await q;
  if (error) return new Response('Unable to export activity', { status: 500 });
  const rows = [['created_at', 'user_email', 'action', 'file_name', 'file_id', 'ip_address', 'user_agent'], ...(data || []).map((r: any) => [r.created_at, r.user_email, r.action, r.file_name, r.file_id || '', r.ip_address || '', r.user_agent || ''])];
  const csv = rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="activity.csv"' } });
}

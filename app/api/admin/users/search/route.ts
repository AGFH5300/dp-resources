import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
export async function GET(req: Request) {
  await requireAdmin();
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 2) return Response.json({ users: [] });
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_resource_memberships')
    .select(
      'id,email,role,created_at,is_suspended,suspended_at,suspended_by,suspension_reason',
    )
    .ilike('email', `%${q}%`)
    .order('email', { ascending: true })
    .limit(15);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const ids = (data || []).map((u) => u.id);
  const latest = new Map<string, string>();
  if (ids.length) {
    const { data: logs } = await sb
      .from('dp_resource_activity_logs')
      .select('user_id,created_at')
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .limit(200);
    (logs || []).forEach((l) => {
      if (!latest.has(l.user_id)) latest.set(l.user_id, l.created_at);
    });
  }
  return Response.json({
    users: (data || []).map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      joined_at: u.created_at,
      latest_activity_at: latest.get(u.id) || null,
      is_suspended: u.is_suspended,
      suspended_at: u.suspended_at,
      suspended_by: u.suspended_by,
      suspension_reason: u.suspension_reason,
    })),
  });
}

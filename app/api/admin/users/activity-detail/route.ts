import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const RANGES = new Set(['today', '7d', '30d', 'all']);

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const requestedRange = String(url.searchParams.get('range') || 'all');
  const range = RANGES.has(requestedRange) ? requestedRange : 'all';

  if (!email || email.length > 320)
    return noStore({ error: 'A valid user email is required.' }, { status: 400 });

  const adminSb = createSupabaseAdminClient();
  const { data: user, error: userError } = await adminSb
    .from('dp_resource_memberships')
    .select('id,email,role,created_at')
    .ilike('email', email)
    .maybeSingle();
  if (userError) return noStore({ error: userError.message }, { status: 500 });
  if (!user) return noStore({ error: 'User not found.' }, { status: 404 });

  const [{ data: profile }, { data: aliasRow }] = await Promise.all([
    adminSb
      .from('dp_resource_profiles')
      .select('username,full_name')
      .eq('id', user.id)
      .maybeSingle(),
    adminSb
      .from('dp_admin_user_aliases')
      .select('alias')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const memberClient = await createClient();
  const resources = await memberClient.rpc('dp_admin_resource_usage_for_user', {
    p_user_id: user.id,
    p_range: range,
  });
  if (resources.error)
    return noStore({ error: 'Could not load user analytics.' }, { status: 403 });

  return noStore({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      joinedAt: user.created_at,
      username: profile?.username || null,
      fullName: profile?.full_name || null,
      alias: aliasRow?.alias || null,
    },
    range,
    resources: resources.data || [],
  });
}

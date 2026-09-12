import { requireAdmin } from '@/lib/auth';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET() {
  await requireAdmin();
  const sb = createSupabaseAdminClient();
  const [
    { data: memberships, error: membershipError },
    { data: aliases, error: aliasError },
    { data: profiles, error: profileError },
  ] = await Promise.all([
    sb
      .from('dp_resource_memberships')
      .select('id,email,role')
      .order('email', { ascending: true }),
    sb.from('dp_admin_user_aliases').select('user_id,alias,updated_at'),
    sb.from('dp_resource_profiles').select('id,username,full_name'),
  ]);

  const error = membershipError || aliasError || profileError;
  if (error) return noStore({ error: error.message }, { status: 500 });

  const aliasById = new Map(
    (aliases || []).map((row) => [row.user_id, row]),
  );
  const profileById = new Map(
    (profiles || []).map((row) => [row.id, row]),
  );

  return noStore({
    users: (memberships || []).map((membership) => {
      const alias = aliasById.get(membership.id) as
        | { alias?: string; updated_at?: string }
        | undefined;
      const profile = profileById.get(membership.id) as
        | { username?: string | null; full_name?: string | null }
        | undefined;
      return {
        id: membership.id,
        email: membership.email,
        role: membership.role,
        username: profile?.username || null,
        fullName: profile?.full_name || null,
        alias: alias?.alias || null,
        aliasUpdatedAt: alias?.updated_at || null,
      };
    }),
  });
}

export async function PATCH(req: Request) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;

  const { membership: admin } = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || '').trim();
  const alias = String(body.alias || '').trim();

  if (!UUID_PATTERN.test(userId))
    return noStore({ error: 'Invalid user identifier.' }, { status: 400 });
  if (alias.length > 80)
    return noStore({ error: 'Alias must be 80 characters or fewer.' }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { data: target, error: targetError } = await sb
    .from('dp_resource_memberships')
    .select('id,email')
    .eq('id', userId)
    .maybeSingle();
  if (targetError)
    return noStore({ error: targetError.message }, { status: 500 });
  if (!target) return noStore({ error: 'User not found.' }, { status: 404 });

  if (!alias) {
    const { error } = await sb
      .from('dp_admin_user_aliases')
      .delete()
      .eq('user_id', userId);
    if (error) return noStore({ error: error.message }, { status: 500 });
    return noStore({ userId, email: target.email, alias: null });
  }

  const { error } = await sb.from('dp_admin_user_aliases').upsert(
    {
      user_id: userId,
      alias,
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    },
    { onConflict: 'user_id' },
  );
  if (error) return noStore({ error: error.message }, { status: 500 });

  return noStore({ userId, email: target.email, alias });
}

import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

async function endSession(sessionId: string, userId: string) {
  const sb = createSupabaseAdminClient();
  await sb
    .from('dp_resource_usage_sessions')
    .update({
      ended_at: new Date().toISOString(),
      page_visible: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .is('ended_at', null);
  return Response.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const { sessionId } = await params;
  const body = await req.json().catch(() => null);
  const pageVisible = Boolean(body?.pageVisible);
  const sb = createSupabaseAdminClient();

  const { data: session } = await sb
    .from('dp_resource_usage_sessions')
    .select('last_heartbeat_at, ended_at, active_seconds, heartbeat_count')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!session || session.ended_at) return Response.json({ ok: true });

  const last = session.last_heartbeat_at
    ? new Date(session.last_heartbeat_at).getTime()
    : Date.now();
  const now = Date.now();
  const deltaSeconds =
    pageVisible && last > now - 5 * 60_000
      ? Math.min(60, Math.max(0, Math.floor((now - last) / 1000)))
      : 0;

  await sb
    .from('dp_resource_usage_sessions')
    .update({
      active_seconds: Number(session.active_seconds || 0) + deltaSeconds,
      heartbeat_count: Number(session.heartbeat_count || 0) + 1,
      last_heartbeat_at: new Date().toISOString(),
      page_visible: pageVisible,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', user.id);

  return Response.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  return endSession((await params).sessionId, user.id);
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  return endSession((await params).sessionId, user.id);
}

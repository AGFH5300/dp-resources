import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

function boundedDelta(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(60, Math.floor(parsed)));
}

async function recordHeartbeat(sessionId: string, userId: string, body: any) {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc('dp_resource_usage_heartbeat_admin_safe', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_page_visible: Boolean(body?.pageVisible),
    p_was_active: Boolean(body?.wasActive ?? body?.pageVisible),
    p_delta_seconds: boundedDelta(body?.deltaSeconds),
  });

  return { sb, error };
}

async function endSession(sessionId: string, userId: string, body: any) {
  const { sb, error } = await recordHeartbeat(sessionId, userId, body);
  if (error) return Response.json({ ok: false }, { status: 503 });
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
  const { error } = await recordHeartbeat(sessionId, user.id, body);
  if (error) return Response.json({ ok: false }, { status: 503 });

  return Response.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const body = await req.json().catch(() => null);
  return endSession((await params).sessionId, user.id, body);
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const body = await req.json().catch(() => null);
  const sessionId = (await params).sessionId;

  if (body?.end === false) {
    const { error } = await recordHeartbeat(sessionId, user.id, body);
    if (error) return Response.json({ ok: false }, { status: 503 });
    return Response.json({ ok: true });
  }

  return endSession(sessionId, user.id, body);
}

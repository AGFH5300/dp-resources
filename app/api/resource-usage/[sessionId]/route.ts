import { sameOriginOrForbidden } from '@/lib/request-security'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase-server'

async function endSession(sessionId: string) { const sb = await createClient(); await sb.rpc('dp_resource_usage_end', { p_session_id: sessionId }); return Response.json({ ok: true }) }
export async function PATCH(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const forbidden = sameOriginOrForbidden(req); if (forbidden) return forbidden
  await requireMember(); const { sessionId } = await params
  const body = await req.json().catch(() => null)
  const sb = await createClient()
  const { error } = await sb.rpc('dp_resource_usage_heartbeat', { p_session_id: sessionId, p_page_visible: Boolean(body?.pageVisible) })
  if (error) return Response.json({ error: 'Unable to update tracking.' }, { status: 400 })
  return Response.json({ ok: true })
}
export async function DELETE(req: Request, { params }: { params: Promise<{ sessionId: string }> }) { const forbidden = sameOriginOrForbidden(req); if (forbidden) return forbidden; await requireMember(); return endSession((await params).sessionId) }
export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) { const forbidden = sameOriginOrForbidden(req); if (forbidden) return forbidden; await requireMember(); return endSession((await params).sessionId) }

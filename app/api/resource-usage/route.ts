import { sameOriginOrForbidden } from '@/lib/request-security'
import { requireMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const forbidden = sameOriginOrForbidden(req); if (forbidden) return forbidden
  await requireMember()
  const body = await req.json().catch(() => null)
  const fileId = String(body?.fileId || '')
  if (!fileId) return Response.json({ error: 'Unable to start tracking.' }, { status: 400 })
  const sb = await createClient()
  const { data, error } = await sb.rpc('dp_resource_usage_start', { p_file_id: fileId })
  if (error) return Response.json({ error: 'Unable to start tracking.' }, { status: 400 })
  return Response.json({ sessionId: data })
}

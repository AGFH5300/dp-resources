import { sameOriginOrForbidden } from '@/lib/request-security'
import { requireMember } from '@/lib/auth'
import { assertInsideRoot } from '@/lib/drive'
import { getIndexedResourceShell } from '@/lib/indexed-resource'
import { createClient } from '@/lib/supabase-server'

const DRIVE_ID_RE = /^[A-Za-z0-9_-]{8,256}$/

export async function POST(req: Request) {
  const forbidden = sameOriginOrForbidden(req); if (forbidden) return forbidden
  await requireMember()
  const body = await req.json().catch(() => null)
  const fileId = String(body?.fileId || '').trim()
  if (!DRIVE_ID_RE.test(fileId)) return Response.json({ ok: false }, { status: 200 })

  let allowedResource = false
  try {
    allowedResource = Boolean(await getIndexedResourceShell(fileId)) || await assertInsideRoot(fileId)
  } catch {
    allowedResource = false
  }
  if (!allowedResource) return Response.json({ error: 'Resource not found.' }, { status: 404 })

  const sb = await createClient()
  const { data, error } = await sb.rpc('dp_resource_usage_start', { p_file_id: fileId })

  if (error || !data) return Response.json({ ok: false }, { status: 200 })
  return Response.json({ sessionId: data })
}

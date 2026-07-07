import 'server-only'
import { createHash } from 'crypto'

const buckets = new Map<string, { count: number; resetAt: number }>()

export function privacySafeRequestKey(request: Request, scope: string) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown'
  const ua = request.headers.get('user-agent') || 'unknown'
  return createHash('sha256').update(`${scope}:${ip}:${ua}`).digest('hex')
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return { ok: true } }
  current.count += 1
  return { ok: current.count <= limit, retryAfter: Math.ceil((current.resetAt - now) / 1000) }
}

import 'server-only';
import { createHash } from 'crypto';
import { createSupabaseAdminClient } from './supabase-admin';

export function privacySafeRequestKey(request: Request, scope: string) {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  const ipPrefix = forwarded?.includes(':')
    ? forwarded.split(':').slice(0, 4).join(':')
    : forwarded?.split('.').slice(0, 3).join('.');
  const ua = request.headers.get('user-agent') || 'unknown';
  return createHash('sha256')
    .update(`${scope}:${ipPrefix || 'unknown'}:${ua.slice(0, 80)}`)
    .digest('hex');
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  scope = 'default',
) {
  try {
    const sb = createSupabaseAdminClient();
    const { data, error } = await sb.rpc('dp_check_rate_limit', {
      p_scope: scope,
      p_request_key_hash: key,
      p_limit: limit,
      p_window_seconds: Math.ceil(windowMs / 1000),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      ok: Boolean(row?.ok),
      retryAfter: Number(row?.retry_after_seconds || 0),
    };
  } catch {
    return { ok: false, retryAfter: Math.ceil(windowMs / 1000) };
  }
}

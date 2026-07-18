import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';

const SECRET_PATTERNS =
  /(token|cookie|secret|key|password|authorization|email|username|name|drive|blocked)/i;
export function safeLog(
  area: string,
  message: string,
  context: Record<string, unknown> = {},
) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context))
    if (!SECRET_PATTERNS.test(k))
      safe[k] = typeof v === 'string' ? v.slice(0, 120) : v;
  console.error(`[${area}] ${message}`, safe);
  if (process.env.SUPABASE_SERVICE_ROLE_KEY)
    createSupabaseAdminClient()
      .from('dp_server_error_events')
      .insert({ area, message: message.slice(0, 200), context: safe })
      .then(
        () => undefined,
        () => undefined,
      );
}

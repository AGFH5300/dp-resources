import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_PATH = /^\/question-bank\/practice\/([0-9a-f-]{36})(?:\/|$)/i;

export type PracticeSessionItemStatus =
  | 'queued'
  | 'viewed'
  | 'completed'
  | 'skipped';

export function practiceSessionIdFromRequest(request: Request) {
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    const requestUrl = new URL(request.url);
    const refererUrl = new URL(referer);
    if (refererUrl.origin !== requestUrl.origin) return null;
    const matched = refererUrl.pathname.match(SESSION_PATH);
    const sessionId = matched?.[1] || '';
    return UUID.test(sessionId) ? sessionId : null;
  } catch {
    return null;
  }
}

export async function updatePracticeSessionItem({
  userId,
  sessionId,
  variantId,
  status,
}: {
  userId: string;
  sessionId: string;
  variantId: string;
  status: 'viewed' | 'completed' | 'skipped';
}) {
  if (!UUID.test(userId) || !UUID.test(sessionId) || !UUID.test(variantId))
    throw new Error('Invalid practice session state identifier.');

  const client = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await client
    .from('dp_qb_practice_sessions')
    .select('id,status,started_at,queue_storage')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return false;

  if (session.queue_storage === 'chunks') {
    const { data, error } = await client.rpc(
      'dp_qb_update_compact_practice_session_item',
      {
        p_user_id: userId,
        p_session_id: sessionId,
        p_variant_id: variantId,
        p_status: status,
      },
    );
    if (error) throw error;
    return data === true;
  }

  const { data: item, error: itemError } = await client
    .from('dp_qb_practice_session_items')
    .select('id,position,status,first_viewed_at,completed_at')
    .eq('session_id', sessionId)
    .eq('variant_id', variantId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) return false;

  const now = new Date().toISOString();
  const currentStatus = item.status as PracticeSessionItemStatus;
  const nextStatus: PracticeSessionItemStatus =
    currentStatus === 'completed'
      ? 'completed'
      : status === 'completed'
        ? 'completed'
        : status === 'skipped'
          ? 'skipped'
          : currentStatus === 'skipped'
            ? 'skipped'
            : 'viewed';
  const { error: updateItemError } = await client
    .from('dp_qb_practice_session_items')
    .update({
      status: nextStatus,
      first_viewed_at: item.first_viewed_at || now,
      completed_at:
        nextStatus === 'completed' ? item.completed_at || now : item.completed_at,
      updated_at: now,
    })
    .eq('id', item.id);
  if (updateItemError) throw updateItemError;

  const { count: remaining, error: remainingError } = await client
    .from('dp_qb_practice_session_items')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .neq('status', 'completed');
  if (remainingError) throw remainingError;
  const completed = (remaining || 0) === 0;
  const { error: updateSessionError } = await client
    .from('dp_qb_practice_sessions')
    .update({
      current_position: item.position,
      status: completed ? 'completed' : 'in_progress',
      started_at: session.started_at || now,
      completed_at: completed ? now : null,
      updated_at: now,
    })
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (updateSessionError) throw updateSessionError;
  return true;
}

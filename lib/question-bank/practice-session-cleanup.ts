import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}.`);
}

export async function cleanupAbandonedPracticeSessions({
  userId,
  activeSessionId = null,
  staleAfterMinutes = 15,
}: {
  userId: string;
  activeSessionId?: string | null;
  staleAfterMinutes?: number;
}) {
  requireUuid(userId, 'practice-session user ID');
  if (activeSessionId) requireUuid(activeSessionId, 'active practice-session ID');

  const safeStaleAfterMinutes = Math.min(
    Math.max(Math.trunc(staleAfterMinutes || 15), 5),
    1440,
  );
  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc(
    'dp_qb_cleanup_abandoned_practice_sessions',
    {
      p_user_id: userId,
      p_active_session_id: activeSessionId,
      p_stale_after_minutes: safeStaleAfterMinutes,
    },
  );
  if (error)
    throw new Error(
      `Unable to clean abandoned practice sessions: ${error.message}`,
    );

  const deletedCount = Number(data || 0);
  if (!Number.isInteger(deletedCount) || deletedCount < 0)
    throw new Error('Unable to clean abandoned practice sessions: invalid response.');
  return deletedCount;
}

export async function deleteAbandonedPracticeSession({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}) {
  requireUuid(userId, 'practice-session user ID');
  requireUuid(sessionId, 'practice-session ID');

  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc(
    'dp_qb_delete_abandoned_practice_session',
    {
      p_user_id: userId,
      p_session_id: sessionId,
    },
  );
  if (error)
    throw new Error(
      `Unable to delete abandoned practice session: ${error.message}`,
    );
  return data === true;
}

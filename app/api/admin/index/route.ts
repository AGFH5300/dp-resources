import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireAdmin } from '@/lib/auth';
import { isDriveConfigured } from '@/lib/drive';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  getIndexSyncStatus,
  INDEX_SYNC_STATE_ID,
  runIndexSyncChunk,
} from '@/lib/index-sync';

export const dynamic = 'force-dynamic';

async function recoverStaleLock() {
  const status = await getIndexSyncStatus();
  const state = status.state;
  if (
    state?.status === 'indexing' &&
    state.lock_expires_at &&
    new Date(state.lock_expires_at).getTime() <= Date.now()
  ) {
    const sb = createSupabaseAdminClient();
    const failedAt = new Date().toISOString();
    await sb
      .from('dp_resource_index_sync_state')
      .update({
        status: 'failed',
        phase: state.phase === 'finalizing' ? 'finalizing' : 'paused',
        lock_token: null,
        lock_expires_at: null,
        heartbeat_at: failedAt,
        updated_at: failedAt,
        error_message: 'Indexing paused after the previous worker lock expired.',
      })
      .eq('id', INDEX_SYNC_STATE_ID)
      .eq('lock_token', state.lock_token);
    return getIndexSyncStatus();
  }
  return status;
}

export async function GET() {
  await requireAdmin();
  return Response.json(await recoverStaleLock(), {
    headers: { 'cache-control': 'private, no-store' },
  });
}

export async function POST(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;
  await requireAdmin();
  if (!isDriveConfigured()) {
    return Response.json(
      { error: 'Drive not configured' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  try {
    return Response.json(await runIndexSyncChunk(), {
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    const latest = await getIndexSyncStatus().catch(() => null);
    return Response.json(
      {
        ...(latest || {}),
        error: error instanceof Error ? error.message : 'Index sync failed',
      },
      { status: 500, headers: { 'cache-control': 'private, no-store' } },
    );
  }
}

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('resumable Drive index sync locking', () => {
  it('keeps GET status read-only and preserves persisted progress', () => {
    const sync = read('lib/index-sync.ts');
    const getStatus = sync.slice(sync.indexOf('export async function getIndexSyncStatus'), sync.indexOf('export async function runIndexSyncChunk'));
    expect(getStatus).not.toContain('.upsert(');
    expect(getStatus).not.toContain('.update(');
    expect(getStatus).not.toContain("folder_queue: []");
    expect(getStatus).toContain("select('*').eq('id', INDEX_SYNC_STATE_ID).maybeSingle()");
  });

  it('returns busy for concurrent POST attempts without queue reset', () => {
    const sync = read('lib/index-sync.ts');
    expect(sync).toContain('lock_token');
    expect(sync).toContain('lock_expires_at');
    expect(sync).toContain('return { busy: true');
    expect(sync).toContain('status.neq.indexing,lock_expires_at.lt.');
    expect(sync).not.toContain("upsert({ id: INDEX_SYNC_STATE_ID, status: 'idle', folder_queue: [] }, { onConflict: 'id' })");
  });

  it('resumes interrupted runs and recovers expired locks', () => {
    const sync = read('lib/index-sync.ts');
    expect(sync).toContain('const queue = startingNewRun || !state.folder_queue?.length ?');
    expect(sync).toContain('state.folder_queue');
    expect(sync).toContain('const baseProcessedFolders = startingNewRun ? 0 : state.processed_folders || 0');
    expect(sync).toContain('const baseIndexedResources = startingNewRun ? 0 : state.indexed_resources || 0');
    expect(sync).toContain('LOCK_TTL_MS = 2 * 60 * 1000');
  });

  it('cleans null stale rows only after successful completion', () => {
    const sync = read('lib/index-sync.ts');
    const completeBlock = sync.slice(sync.indexOf('if (chunk.complete)'), sync.indexOf('} else {', sync.indexOf('if (chunk.complete)')));
    expect(completeBlock).toContain('last_seen_sync_run_id.is.null');
    expect(completeBlock).toContain('delete()');
    const catchBlock = sync.slice(sync.indexOf('} catch (e)'));
    expect(catchBlock).not.toContain('delete()');
  });

  it('adds the singleton row and lock columns in a later migration', () => {
    const migration = read('supabase/migrations/20260702053000_fix_resource_index_sync_locking.sql');
    expect(migration).toContain('00000000-0000-0000-0000-000000000001');
    expect(migration).toContain('on conflict (id) do nothing');
    expect(migration).toContain('lock_token uuid null');
    expect(migration).toContain('lock_expires_at timestamptz null');
    expect(migration).toContain('dp_resource_index_sync_state_lock_status_idx');
  });
});

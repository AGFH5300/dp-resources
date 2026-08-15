import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('resumable Drive index sync locking', () => {
  it('keeps GET status read-only and lightweight for one-second polling', () => {
    const sync = read('lib/index-sync.ts');
    const getStatus = sync.slice(
      sync.indexOf('export async function getIndexSyncStatus'),
      sync.indexOf('async function runWithConcurrency'),
    );
    expect(getStatus).not.toContain('.upsert(');
    expect(getStatus).not.toContain('.update(');
    expect(getStatus).toContain(".from('dp_resource_index_sync_state')");
    expect(getStatus).toContain(".select('*')");
    expect(getStatus).toContain('.maybeSingle()');
    expect(getStatus).not.toContain("count: 'exact'");
  });

  it('returns busy for concurrent POST attempts without queue reset', () => {
    const sync = read('lib/index-sync.ts');
    expect(sync).toContain('lock_token');
    expect(sync).toContain('lock_expires_at');
    expect(sync).toContain('return { busy: true');
    expect(sync).toContain('status.neq.indexing,lock_token.is.null,lock_expires_at.lt.');
    expect(sync).not.toContain(
      "upsert({ id: INDEX_SYNC_STATE_ID, status: 'idle', folder_queue: [] }, { onConflict: 'id' })",
    );
  });

  it('resumes interrupted runs and finalization while recovering expired locks', () => {
    const sync = read('lib/index-sync.ts');
    expect(sync).toContain('const previousQueue = state.folder_queue || []');
    expect(sync).toContain('const queue = startingNewRun ? [] : previousQueue');
    expect(sync).toContain('const baseProcessedFolders = startingNewRun');
    expect(sync).toContain('const baseIndexedResources = startingNewRun');
    expect(sync).toContain("state.phase === 'finalizing'");
    expect(sync).toContain('LOCK_TTL_MS = 2 * 60 * 1000');
  });

  it('cleans null stale rows only inside successful-run finalization', () => {
    const sync = read('lib/index-sync.ts');
    const finalizer = sync.slice(
      sync.indexOf('async function finalizeIndexRun'),
      sync.indexOf('export async function runIndexSyncChunk'),
    );
    expect(finalizer).toContain('last_seen_sync_run_id.is.null');
    expect(finalizer).toContain('.delete()');
    const catchBlock = sync.slice(sync.lastIndexOf('} catch (error)'));
    expect(catchBlock).not.toContain('.delete()');
  });

  it('keeps the last completed index available while a refresh runs', () => {
    const sync = read('lib/index-sync.ts');
    const search = read('app/api/search/route.ts');
    expect(sync).toContain('completed_at: state.completed_at');
    expect(search).toContain(
      "return { available, updating: available && state?.status !== 'complete' }",
    );
    expect(search).toContain('if (!available)');
    expect(search).toContain("{ folders: [], files: [], indexState: 'preparing' }");
    expect(search).toContain('{ ...cachedPayload, indexState }');
  });

  it('adds the singleton row and lock columns in the original locking migration', () => {
    const migration = read(
      'supabase/migrations/20260702053000_fix_resource_index_sync_locking.sql',
    );
    expect(migration).toContain('00000000-0000-0000-0000-000000000001');
    expect(migration).toContain('on conflict (id) do nothing');
    expect(migration).toContain('lock_token uuid null');
    expect(migration).toContain('lock_expires_at timestamptz null');
    expect(migration).toContain('dp_resource_index_sync_state_lock_status_idx');
  });
});

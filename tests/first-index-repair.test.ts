import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

defineReadOnlyTests();

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function defineReadOnlyTests() {
  describe('admin index performance architecture', () => {
    it('indexes one Drive list page up to 1000 items so large folders are not capped at 500', () => {
      const drive = read('lib/drive.ts');
      expect(drive).toContain('pageSize = 1000');
      expect(drive).toContain('pageSize: Math.min(pageSize, 1000)');
      expect(drive).not.toContain('rows.length >= maxItems) break');
    });

    it('preserves pagination cursors in resumable queues', () => {
      const drive = read('lib/drive.ts');
      const crawler = read('lib/index-crawler.ts');
      const sync = read('lib/index-sync.ts');
      expect(drive).toContain('pageToken?: string');
      expect(drive).toContain('pageToken: folder.pageToken');
      expect(crawler).toContain(
        'queue.push({ ...folder, pageToken: page.nextPageToken })',
      );
      expect(sync).toContain('pageToken?: string');
    });

    it('uses a dedicated live crawler with eight-way bounded Drive concurrency', () => {
      const crawler = read('lib/index-crawler.ts');
      const sync = read('lib/index-sync.ts');
      expect(crawler).toContain('Math.min(Math.max(options.concurrency ?? 8, 1), 8)');
      expect(crawler).toContain('listDriveIndexPage(folder, 1000)');
      expect(crawler).toContain('onWave');
      expect(sync).toContain('const CRAWL_CONCURRENCY = 8');
      expect(sync).toContain('crawlDriveIndexChunkLive');
      expect(sync).toContain('concurrency: CRAWL_CONCURRENCY');
    });

    it('resumes a paused run with the existing queue and sync run id', () => {
      const sync = read('lib/index-sync.ts');
      expect(sync).toContain('state.folder_queue || []');
      expect(sync).toContain(
        'const syncRunId = startingNewRun ? randomUUID() : state.sync_run_id!',
      );
      expect(sync).toContain(
        'const baseIndexedResources = startingNewRun',
      );
      expect(sync).toContain("state.phase === 'complete'");
    });

    it('runs stale cleanup and recursive source inheritance only in finalization', () => {
      const sync = read('lib/index-sync.ts');
      const finalizer = sync.slice(
        sync.indexOf('async function finalizeIndexRun'),
        sync.indexOf('export async function runIndexSyncChunk'),
      );
      const runLoop = sync.slice(sync.indexOf('export async function runIndexSyncChunk'));
      expect(finalizer).toContain('last_seen_sync_run_id.neq');
      expect(finalizer).toContain('dp_resolve_resource_source_inheritance');
      expect(runLoop.match(/dp_resolve_resource_source_inheritance/g) || []).toHaveLength(0);
    });

    it('adds the recursive parent lookup index used by source inheritance', () => {
      const migration = read(
        'supabase/migrations/20260815114655_index_sync_command_center.sql',
      );
      expect(migration).toContain('dp_resource_index_parent_drive_file_id_idx');
      expect(migration).toContain('(parent_drive_file_id)');
    });
  });

  describe('admin index panel live behavior', () => {
    it('does not parse empty or non-JSON error responses as JSON', () => {
      const panel = read('app/admin/index-sync-panel.tsx');
      expect(panel).toContain("contentType.includes('application/json')");
      expect(panel.indexOf('await response.text()')).toBeLessThan(
        panel.indexOf('await response.json()'),
      );
    });

    it('keeps POST chunks sequential while allowing GET polling during a POST', () => {
      const panel = read('app/admin/index-sync-panel.tsx');
      expect(panel).toContain('postInFlightRef.current');
      expect(panel).toContain('refreshInFlightRef.current');
      expect(panel).toContain('if (postInFlightRef.current || !autoRunRef.current) return');
      expect(panel).toContain("await fetch('/api/admin/index', { method: 'POST' })");
      expect(panel).toContain('setInterval(refresh, active ? 1000 : 5000)');
      expect(panel).toContain('setTimeout(runNextChunk, 120)');
    });

    it('persists automatic continuation across an admin page reload', () => {
      const panel = read('app/admin/index-sync-panel.tsx');
      expect(panel).toContain("sessionStorage.setItem('dp-index-autocontinue', '1')");
      expect(panel).toContain("sessionStorage.getItem('dp-index-autocontinue')");
      expect(panel).toContain('Pause after this batch');
    });
  });
}

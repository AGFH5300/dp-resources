import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

defineReadOnlyTests();

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function defineReadOnlyTests() {
  describe('urgent first index performance repair', () => {
    it('indexes one Drive list page up to 1000 items so folders with more than 500 direct children are not capped', () => {
      const drive = read('lib/drive.ts');
      expect(drive).toContain('pageSize = 1000');
      expect(drive).toContain('pageSize: Math.min(pageSize, 1000)');
      expect(drive).not.toContain('rows.length >= maxItems) break');
    });

    it('preserves pagination cursors in the JSON folder queue', () => {
      const drive = read('lib/drive.ts');
      const sync = read('lib/index-sync.ts');
      expect(drive).toContain('pageToken?: string');
      expect(drive).toContain('pageToken: folder.pageToken');
      expect(drive).toContain(
        'queue.push({ ...folder, pageToken: page.nextPageToken })',
      );
      expect(sync).toContain('pageToken?: string');
    });

    it('trusts queued folders discovered from the configured root without repeated root assertions or folder views', () => {
      const chunk = read('lib/drive.ts').slice(
        read('lib/drive.ts').indexOf(
          'export async function crawlDriveIndexChunk',
        ),
      );
      expect(chunk).not.toContain('assertInsideRoot(');
      expect(chunk).not.toContain('getFolderView(');
      expect(chunk).toContain('listDriveIndexPage(folder, 1000)');
    });

    it('bounds crawler concurrency at 6', () => {
      const drive = read('lib/drive.ts');
      const sync = read('lib/index-sync.ts');
      expect(drive).toContain('Math.min(options.concurrency ?? 6, 6)');
      expect(sync).toContain('concurrency: initialRunIncomplete ? 6 : 2');
    });

    it('resumes a paused initial run with the existing queue and sync run id', () => {
      const sync = read('lib/index-sync.ts');
      expect(sync).toContain(
        'const syncRunId = startingNewRun ? randomUUID() : state.sync_run_id',
      );
      expect(sync).toContain('state.folder_queue');
      expect(sync).toContain(
        'const baseIndexedResources = startingNewRun ? 0 : state.indexed_resources || 0',
      );
    });

    it('deletes stale rows only after a genuinely complete sync', () => {
      const sync = read('lib/index-sync.ts');
      const completeBlock = sync.slice(
        sync.indexOf('if (chunk.complete)'),
        sync.indexOf('} else {', sync.indexOf('if (chunk.complete)')),
      );
      expect(completeBlock).toContain('delete()');
      expect(completeBlock).toContain('last_seen_sync_run_id.neq');
    });
  });

  describe('admin index panel safety', () => {
    it('does not parse empty or non-JSON error responses as JSON', () => {
      const panel = read('app/admin/index-sync-panel.tsx');
      expect(panel).toContain("contentType.includes('application/json')");
      expect(panel.indexOf('await response.text()')).toBeLessThan(
        panel.indexOf('await response.json()'),
      );
      expect(panel).toContain('readIndexResponse(r)');
    });

    it('keeps exactly one indexing request in flight and uses short successful retry delay', () => {
      const panel = read('app/admin/index-sync-panel.tsx');
      expect(panel).toContain('if (inFlightRef.current) return');
      expect(panel).toContain('inFlightRef.current = true');
      expect(panel).toContain('setTimeout(runNextChunk, 250)');
    });
  });
}

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('resumed index queue regression repair', () => {
  it('allows resumed child-folder and continuation-only queues without requiring the root id', () => {
    const crawler = read('lib/index-crawler.ts');
    expect(crawler).not.toContain(
      'Index queue must originate from the configured Drive root.',
    );
    expect(crawler).not.toContain('queue.every((item) => item.id !== rootId)');
    expect(crawler).not.toContain('assertInsideRoot(');
    expect(crawler).toContain(
      'queue.push({ ...folder, pageToken: page.nextPageToken })',
    );
    expect(crawler).toContain('listDriveIndexPage(folder, 1000)');
  });

  it('seeds exactly one configured root item only when the live crawler receives an empty queue', () => {
    const crawler = read('lib/index-crawler.ts');
    expect(crawler).toContain('if (!queue.length)');
    expect(crawler).toContain(
      "queue.push({ id: rootFolderId(), path: 'Library', parent: null });",
    );
    expect(
      crawler.match(
        /queue\.push\(\{ id: rootFolderId\(\), path: 'Library', parent: null \}\)/g,
      ),
    ).toHaveLength(1);
  });

  it('preserves an existing sync run id and stored queue when resuming', () => {
    const sync = read('lib/index-sync.ts');
    expect(sync).toContain(
      'const syncRunId = startingNewRun ? randomUUID() : state.sync_run_id!',
    );
    expect(sync).toContain(
      'const queue = startingNewRun ? [] : previousQueue',
    );
    expect(sync).toContain(
      'const baseProcessedFolders = startingNewRun',
    );
    expect(sync).toContain(
      'const baseIndexedResources = startingNewRun',
    );
  });

  it('can resume finalization without rescanning the Drive tree', () => {
    const sync = read('lib/index-sync.ts');
    expect(sync).toContain("state.phase === 'finalizing'");
    expect(sync).toContain('if (resumeFinalization)');
    expect(sync).toContain('await finalizeIndexRun({');
  });

  it('restores the last committed queue and counters after a failed batch', () => {
    const sync = read('lib/index-sync.ts');
    const catchBlock = sync.slice(sync.lastIndexOf('} catch (error)'));
    expect(catchBlock).not.toContain('delete()');
    expect(catchBlock).toContain("status: 'failed'");
    expect(catchBlock).toContain('folder_queue: committedQueue');
    expect(catchBlock).toContain('processed_folders: committedProcessedFolders');
  });

  it('retains existing panel counters after an API error', () => {
    const panel = read('app/admin/index-sync-panel.tsx');
    expect(panel).toContain(
      'function preserveCountsOnError(previous: Payload, next: Payload): Payload',
    );
    expect(panel).toContain(
      'totalIndexed: next.totalIndexed || previous.totalIndexed',
    );
    expect(panel).toContain(
      'folderIndexed: next.folderIndexed ?? previous.folderIndexed',
    );
    expect(panel).toContain(
      'fileIndexed: next.fileIndexed ?? previous.fileIndexed',
    );
    expect(panel).toContain("contentType.includes('application/json')");
  });
});

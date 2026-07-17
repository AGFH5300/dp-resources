import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('resumed index queue regression repair', () => {
  it('allows resumed child-folder and continuation-only queues without requiring the root id', () => {
    const drive = read('lib/drive.ts');
    const chunk = drive.slice(
      drive.indexOf('export async function crawlDriveIndexChunk'),
    );
    expect(chunk).not.toContain(
      'Index queue must originate from the configured Drive root.',
    );
    expect(chunk).not.toContain('queue.every((item) => item.id !== rootId)');
    expect(chunk).not.toContain('assertInsideRoot(');
    expect(chunk).toContain(
      'queue.push({ ...folder, pageToken: page.nextPageToken })',
    );
    expect(chunk).toContain('listDriveIndexPage(folder, 1000)');
  });

  it('seeds exactly one configured root item only when crawlDriveIndexChunk receives an empty queue', () => {
    const drive = read('lib/drive.ts');
    const chunk = drive.slice(
      drive.indexOf('export async function crawlDriveIndexChunk'),
      drive.indexOf(
        'export async function crawlDriveIndex(options',
        drive.indexOf('export async function crawlDriveIndexChunk'),
      ),
    );
    expect(chunk).toContain(
      "if (!queue.length) queue.push({ id: rootId, path: 'Library', parent: null });",
    );
    expect(
      chunk.match(
        /queue\.push\(\{ id: rootId, path: 'Library', parent: null \}\)/g,
      ),
    ).toHaveLength(1);
  });

  it('preserves an existing sync run id and stored queue when resuming instead of treating it as new', () => {
    const sync = read('lib/index-sync.ts');
    expect(sync).toContain(
      'const syncRunId = startingNewRun ? randomUUID() : state.sync_run_id',
    );
    expect(sync).toContain(
      'const queue = startingNewRun ? [] : state.folder_queue || []',
    );
    expect(sync).toContain(
      'const baseProcessedFolders = startingNewRun ? 0 : state.processed_folders || 0',
    );
    expect(sync).toContain(
      'const baseIndexedResources = startingNewRun ? 0 : state.indexed_resources || 0',
    );
  });

  it('does not delete index rows on the queue validation failure path', () => {
    const sync = read('lib/index-sync.ts');
    const catchBlock = sync.slice(sync.indexOf('} catch (e)'));
    expect(catchBlock).not.toContain('delete()');
    expect(catchBlock).toContain("status: 'failed'");
  });

  it('retains existing panel counters after an API error and displays the error quietly', () => {
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
    expect(panel).toContain(
      '{data.error && <p className="mt-2 text-xs text-amber-700">{data.error}</p>}',
    );
    expect(panel).toContain("contentType.includes('application/json')");
  });
});

import 'server-only';
import {
  listDriveIndexPage,
  rootFolderId,
  type DriveIndexFolderCursor,
  type DriveIndexRow,
} from './drive';

export type DriveIndexWaveProgress = {
  rows: number;
  files: number;
  folders: number;
  processedFolders: number;
  queueDepth: number;
  continuationPages: number;
  currentPath: string | null;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let next = 0;
  let active = 0;

  await new Promise<void>((resolve, reject) => {
    let failed = false;
    const launch = () => {
      if (failed) return;
      if (next >= items.length && active === 0) return resolve();
      while (active < limit && next < items.length) {
        const index = next++;
        active += 1;
        fn(items[index]).then(
          (result) => {
            results[index] = result;
            active -= 1;
            launch();
          },
          (error) => {
            failed = true;
            reject(error);
          },
        );
      }
    };
    launch();
  });

  return results;
}

/**
 * Admin index crawler optimized for resumable background-like batches.
 *
 * It deliberately lives beside the legacy crawl helper so the admin sync can
 * expose wave-by-wave telemetry without changing ordinary Drive browsing.
 */
export async function crawlDriveIndexChunkLive(options: {
  queue: DriveIndexFolderCursor[];
  maxFolders?: number;
  maxItems?: number;
  concurrency?: number;
  timeBudgetMs?: number;
  onWave?: (progress: DriveIndexWaveProgress) => Promise<void> | void;
}) {
  const maxFolders = options.maxFolders ?? Number.POSITIVE_INFINITY;
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
  const concurrency = Math.min(Math.max(options.concurrency ?? 8, 1), 8);
  const deadline = Date.now() + (options.timeBudgetMs ?? 24_000);
  const queue: DriveIndexFolderCursor[] = [...options.queue];
  if (!queue.length) {
    queue.push({ id: rootFolderId(), path: 'Library', parent: null });
  }

  const rows: DriveIndexRow[] = [];
  let files = 0;
  let folders = 0;
  let processedFolders = 0;

  while (
    queue.length &&
    processedFolders < maxFolders &&
    rows.length < maxItems &&
    Date.now() < deadline
  ) {
    const wave = queue.splice(
      0,
      Math.min(concurrency, queue.length, maxFolders - processedFolders),
    );
    const pages = await mapWithConcurrency(wave, concurrency, (folder) =>
      listDriveIndexPage(folder, 1000),
    );

    for (let i = 0; i < pages.length; i += 1) {
      const folder = wave[i];
      const page = pages[i];
      rows.push(...page.rows);
      for (const row of page.rows) {
        if (row.is_folder) folders += 1;
        else files += 1;
      }
      queue.push(...page.childFolders);
      if (page.nextPageToken) {
        queue.push({ ...folder, pageToken: page.nextPageToken });
      } else {
        processedFolders += 1;
      }
    }

    if (options.onWave) {
      await options.onWave({
        rows: rows.length,
        files,
        folders,
        processedFolders,
        queueDepth: queue.length,
        continuationPages: queue.filter((item) => item.pageToken).length,
        currentPath: wave.at(-1)?.path || null,
      });
    }
  }

  return {
    rows,
    files,
    folders,
    queue,
    complete: queue.length === 0,
    remainingFolders: queue.length,
    processedFolders,
  };
}

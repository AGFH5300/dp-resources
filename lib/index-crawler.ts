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

type DrivePageResult = {
  folder: DriveIndexFolderCursor;
  page: Awaited<ReturnType<typeof listDriveIndexPage>>;
};

/**
 * Admin index crawler optimized for resumable background-like batches.
 *
 * Unlike the legacy wave crawler, this keeps a continuous pool of Drive list
 * requests busy. One slow folder therefore no longer stalls every other free
 * request slot while the crawler waits for a whole wave to finish.
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
  let nextTaskId = 0;
  let lastProgressWrite = 0;
  let lastCurrentPath: string | null = queue[0]?.path || null;
  let telemetryInFlight: Promise<void> | null = null;
  let inFlightContinuationPages = 0;

  const inFlight = new Map<number, Promise<DrivePageResult>>();

  const progressSnapshot = (): DriveIndexWaveProgress => ({
    rows: rows.length,
    files,
    folders,
    processedFolders,
    queueDepth: queue.length + inFlight.size,
    continuationPages:
      queue.filter((item) => item.pageToken).length + inFlightContinuationPages,
    currentPath: lastCurrentPath,
  });

  const publishProgress = (force = false) => {
    if (!options.onWave) return;
    const now = Date.now();
    if (!force && (telemetryInFlight || now - lastProgressWrite < 800)) return;
    lastProgressWrite = now;
    const snapshot = progressSnapshot();
    telemetryInFlight = Promise.resolve(options.onWave(snapshot))
      .catch(() => {
        // Telemetry is observability, not indexing correctness. A transient
        // heartbeat write must not discard an otherwise valid Drive batch.
      })
      .finally(() => {
        telemetryInFlight = null;
      });
  };

  const launch = (folder: DriveIndexFolderCursor) => {
    const taskId = nextTaskId++;
    if (folder.pageToken) inFlightContinuationPages += 1;
    const task = listDriveIndexPage(folder, 1000).then((page) => ({
      folder,
      page,
    }));
    inFlight.set(taskId, task);
    void task.then(
      () => {
        inFlight.delete(taskId);
        if (folder.pageToken) inFlightContinuationPages -= 1;
      },
      () => {
        inFlight.delete(taskId);
        if (folder.pageToken) inFlightContinuationPages -= 1;
      },
    );
  };

  const canLaunch = () =>
    queue.length > 0 &&
    inFlight.size < concurrency &&
    Date.now() < deadline &&
    rows.length < maxItems &&
    processedFolders + inFlight.size < maxFolders;

  const fillWorkerPool = () => {
    while (canLaunch()) {
      const folder = queue.shift();
      if (!folder) break;
      launch(folder);
    }
  };

  const consume = ({ folder, page }: DrivePageResult) => {
    lastCurrentPath = folder.path;
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
    publishProgress();
  };

  fillWorkerPool();

  while (inFlight.size > 0) {
    const result = await Promise.race(inFlight.values());
    consume(result);

    if (
      Date.now() >= deadline ||
      rows.length >= maxItems ||
      processedFolders >= maxFolders
    ) {
      // Cursors already handed to Drive must be allowed to finish; otherwise a
      // successful partial batch could return without those cursors in its
      // resumable queue. Stop launching and drain only the few already active.
      while (inFlight.size > 0) {
        consume(await Promise.race(inFlight.values()));
      }
      break;
    }

    fillWorkerPool();
  }

  if (telemetryInFlight) await telemetryInFlight;
  publishProgress(true);
  if (telemetryInFlight) await telemetryInFlight;

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

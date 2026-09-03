'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const FIRST_BATCH_SIZE = 6;
const NEXT_BATCH_SIZE = 4;
const START_DELAY_MS = 90;
const NEXT_BATCH_DELAY_MS = 450;
const warmedFolderIds = new Set<string>();
const warmingFolderIds = new Set<string>();

type ConnectionInfo = {
  saveData?: boolean;
  effectiveType?: string;
};

function constrainedConnection() {
  const connection = (
    navigator as Navigator & { connection?: ConnectionInfo }
  ).connection;
  return Boolean(
    connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g',
  );
}

export function LibraryFolderPrefetch({
  folderIds,
  rootId,
}: {
  folderIds: string[];
  rootId: string;
}) {
  const router = useRouter();
  const pending = useMemo(
    () =>
      [...new Set(folderIds)].filter(
        (folderId) =>
          folderId &&
          folderId !== rootId &&
          !warmedFolderIds.has(folderId) &&
          !warmingFolderIds.has(folderId),
      ),
    [folderIds, rootId],
  );

  useEffect(() => {
    if (!pending.length || constrainedConnection()) return;

    let cancelled = false;
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const warmNextBatch = async () => {
      if (cancelled || cursor >= pending.length) return;

      const size = cursor === 0 ? FIRST_BATCH_SIZE : NEXT_BATCH_SIZE;
      const batch = pending.slice(cursor, cursor + size);
      cursor += batch.length;

      for (const folderId of batch) {
        warmingFolderIds.add(folderId);
        router.prefetch(`/library?folder=${encodeURIComponent(folderId)}`);
      }

      try {
        const response = await fetch('/api/library/warm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderIds: batch }),
          keepalive: true,
        });
        for (const folderId of batch) {
          warmingFolderIds.delete(folderId);
          if (response.ok) warmedFolderIds.add(folderId);
        }
      } catch {
        for (const folderId of batch) warmingFolderIds.delete(folderId);
        // Navigation still works normally if background warming is unavailable.
      }

      if (!cancelled && cursor < pending.length) {
        timer = setTimeout(warmNextBatch, NEXT_BATCH_DELAY_MS);
      }
    };

    timer = setTimeout(warmNextBatch, START_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pending, router]);

  return null;
}

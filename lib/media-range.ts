import 'server-only';

import { getDriveMediaFetch, safeDownloadName } from './drive';
import { getFastDriveMediaFetch } from './drive-media-fast';

const DRIVE_FALLBACK_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Google Drive media request timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function getDriveMediaResponse(fileId: string, range?: string) {
  let firstResponse: Response | null = null;
  let firstError: unknown;

  try {
    firstResponse = await getFastDriveMediaFetch(fileId, range);
    if (
      firstResponse.ok ||
      firstResponse.status === 206 ||
      firstResponse.status === 416
    ) {
      return firstResponse;
    }
    await firstResponse.body?.cancel().catch(() => undefined);
  } catch (error) {
    firstError = error;
  }

  try {
    return await withTimeout(
      getDriveMediaFetch(fileId, range),
      DRIVE_FALLBACK_TIMEOUT_MS,
    );
  } catch (fallbackError) {
    if (firstResponse) return firstResponse;
    throw fallbackError || firstError;
  }
}

export async function fetchDriveMediaResponse(
  fileId: string,
  mimeType: string,
  name: string,
  range?: string,
) {
  const upstream = await getDriveMediaResponse(fileId, range);
  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') || mimeType,
    'cache-control': 'private, max-age=300, must-revalidate',
    vary: 'Cookie',
    'accept-ranges': 'bytes',
    'content-disposition': `inline; filename="${safeDownloadName(name)}"`,
  });
  for (const header of [
    'content-length',
    'content-range',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

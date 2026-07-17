import 'server-only';

import { safeDownloadName } from './drive';
import { getFastDriveMediaFetch } from './drive-media-fast';

export async function fetchDriveMediaResponse(
  fileId: string,
  mimeType: string,
  name: string,
  range?: string,
) {
  const upstream = await getFastDriveMediaFetch(fileId, range);
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

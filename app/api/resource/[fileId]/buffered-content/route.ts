import { GET as getContent } from '../content/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BUFFERED_RESOURCE_BYTES = 64 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function GET(
  req: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  // Range-capable media should keep the normal streaming path. This endpoint is
  // for previews that consume the whole file before rendering it in the browser.
  if (req.headers.has('range')) return getContent(req, context);

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await getContent(req, context);
      if (response.status === 304) return response;

      if (!response.ok) {
        if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS - 1)
          return response;
        await response.body?.cancel().catch(() => undefined);
      } else {
        const fileSize = Number(response.headers.get('x-file-size'));
        if (
          !Number.isSafeInteger(fileSize) ||
          fileSize <= 0 ||
          fileSize > MAX_BUFFERED_RESOURCE_BYTES
        ) {
          const headers = new Headers(response.headers);
          headers.set('x-content-delivery', 'streamed-large');
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        }

        try {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!bytes.byteLength)
            throw new Error('Buffered resource response was empty');

          const headers = new Headers(response.headers);
          headers.set('content-length', String(bytes.byteLength));
          headers.set('x-content-delivery', 'buffered-retry');
          return new Response(bytes, { status: response.status, headers });
        } catch (error) {
          lastError = error;
          await response.body?.cancel().catch(() => undefined);
          if (attempt === MAX_ATTEMPTS - 1) break;
        }
      }
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS - 1) break;
    }

    await delay(150 * (attempt + 1));
  }

  console.error('Buffered resource delivery failed after retries', {
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });
  return new Response('Unable to retrieve this file', { status: 502 });
}

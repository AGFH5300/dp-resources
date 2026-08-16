import { putPrivateR2Object } from './r2-s3.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const r2Bucket = process.env.R2_PDF_PREVIEW_BUCKET?.trim();
if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
if (!r2Bucket) throw new Error('R2_PDF_PREVIEW_BUCKET is required');

const nativeFetch = globalThis.fetch.bind(globalThis);
const storagePrefix = `${supabaseUrl}/storage/v1/object/`;
const storeTextRpcPath = '/rest/v1/rpc/dp_store_pdf_preview_text';

function headerValue(headers, name) {
  return new Headers(headers || {}).get(name);
}

async function bodyBuffer(body) {
  if (body == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

async function mirrorPdfSearchManifest(input, init, requestUrl) {
  try {
    const sourceBody =
      init.body ?? (input instanceof Request ? input.clone().body : null);
    const bytes = await bodyBuffer(sourceBody);
    if (!bytes.length) return;
    const payload = JSON.parse(bytes.toString('utf8'));
    const documentId = String(payload?.p_document_id || '').trim();
    if (!documentId || !Array.isArray(payload?.p_pages)) return;

    const pages = [];
    let previousPage = 0;
    for (const entry of payload.p_pages) {
      const pageNumber = Number(entry?.pageNumber);
      const text = entry?.text;
      if (
        !Number.isSafeInteger(pageNumber) ||
        pageNumber < 1 ||
        pageNumber <= previousPage ||
        typeof text !== 'string' ||
        text.length > 200_000
      ) {
        throw new Error('Invalid PDF search text payload');
      }
      pages.push([pageNumber, text]);
      previousPage = pageNumber;
    }

    const manifest = Buffer.from(
      JSON.stringify({ v: 1, d: documentId, p: pages }),
      'utf8',
    );
    await putPrivateR2Object({
      bucket: r2Bucket,
      key: `pdf-preview-search/${documentId}.json`,
      body: manifest,
      contentType: 'application/json',
      cacheControl: 'private, max-age=31536000, immutable',
      signal: init.signal,
    });
    console.log(
      JSON.stringify({
        event: 'pdf_preview_search_manifest_mirrored',
        documentId,
        pages: pages.length,
        bytes: manifest.length,
      }),
    );
  } catch (error) {
    // Migration bridge: never make the existing Postgres search-text write fail
    // because the additional private-object mirror was unavailable.
    console.warn(
      JSON.stringify({
        event: 'pdf_preview_search_manifest_mirror_failed',
        requestUrl,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

globalThis.fetch = async (input, init = {}) => {
  const requestUrl =
    typeof input === 'string' || input instanceof URL
      ? String(input)
      : input.url;
  const method = (
    init.method || (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();

  const parsedRequestUrl = new URL(requestUrl);
  if (
    method === 'POST' &&
    parsedRequestUrl.origin === new URL(supabaseUrl).origin &&
    parsedRequestUrl.pathname.endsWith(storeTextRpcPath)
  ) {
    await mirrorPdfSearchManifest(input, init, requestUrl);
    return nativeFetch(input, init);
  }

  if (
    !requestUrl.startsWith(storagePrefix) ||
    !['POST', 'PUT'].includes(method)
  ) {
    return nativeFetch(input, init);
  }

  const parsed = new URL(requestUrl);
  const encodedObject = parsed.pathname.slice('/storage/v1/object/'.length);
  const [requestedBucket, ...keyParts] = encodedObject.split('/');
  if (!requestedBucket || !keyParts.length) return nativeFetch(input, init);

  const key = keyParts.map(decodeURIComponent).join('/');
  const bytes = await bodyBuffer(
    init.body ?? (input instanceof Request ? input.clone().body : null),
  );
  const result = await putPrivateR2Object({
    bucket: r2Bucket,
    key,
    body: bytes,
    contentType: headerValue(init.headers, 'content-type') || 'image/jpeg',
    cacheControl: 'private, max-age=31536000, immutable',
    signal: init.signal,
  });

  return new Response(JSON.stringify({ Key: `${requestedBucket}/${key}` }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...(result.etag ? { etag: result.etag } : {}),
    },
  });
};

await import('./pdf-preview-worker.mjs');

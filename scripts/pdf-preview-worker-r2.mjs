import { createHash } from 'node:crypto';

import { getPrivateR2Object, putPrivateR2Object } from './r2-s3.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const r2Bucket = process.env.R2_PDF_PREVIEW_BUCKET?.trim();
const fallbackBucket =
  process.env.PDF_SEARCH_MANIFEST_FALLBACK_BUCKET?.trim() || 'pdf-previews';
if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
if (!supabaseServiceRoleKey)
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
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

function sha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

function encodedObjectPath(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function putSupabasePrivateObject({ bucket, key, body, signal }) {
  const response = await nativeFetch(
    `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedObjectPath(key)}`,
    {
      method: 'POST',
      signal,
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        'content-type': 'application/json',
        'cache-control': 'private, max-age=31536000, immutable',
        'x-upsert': 'true',
      },
      body,
    },
  );
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(
      `Supabase fallback manifest upload failed (${response.status})${message ? `: ${message.slice(0, 200)}` : ''}`,
    );
  }
}

async function getSupabasePrivateObject({ bucket, key, signal }) {
  return nativeFetch(
    `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedObjectPath(key)}`,
    {
      signal,
      cache: 'no-store',
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );
}

async function mirrorPdfSearchManifest(input, init, requestUrl) {
  try {
    const sourceBody =
      init.body ?? (input instanceof Request ? input.clone().body : null);
    const bytes = await bodyBuffer(sourceBody);
    if (!bytes.length) return null;
    const payload = JSON.parse(bytes.toString('utf8'));
    const documentId = String(payload?.p_document_id || '').trim();
    if (!documentId || !Array.isArray(payload?.p_pages)) return null;

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
    const key = `pdf-preview-search/${documentId}.json`;
    const expectedSha = sha256(manifest);

    await Promise.all([
      putPrivateR2Object({
        bucket: r2Bucket,
        key,
        body: manifest,
        contentType: 'application/json',
        cacheControl: 'private, max-age=31536000, immutable',
        sha256Metadata: expectedSha,
        signal: init.signal,
      }),
      putSupabasePrivateObject({
        bucket: fallbackBucket,
        key,
        body: manifest,
        signal: init.signal,
      }),
    ]);

    const [r2Response, fallbackResponse] = await Promise.all([
      getPrivateR2Object({
        bucket: r2Bucket,
        key,
        signal: init.signal,
      }),
      getSupabasePrivateObject({
        bucket: fallbackBucket,
        key,
        signal: init.signal,
      }),
    ]);
    if (!r2Response.ok || !fallbackResponse.ok) {
      throw new Error(
        `Manifest verification read failed (r2=${r2Response.status}, supabase=${fallbackResponse.status})`,
      );
    }
    const [r2Bytes, fallbackBytes] = await Promise.all([
      r2Response.arrayBuffer().then((body) => Buffer.from(body)),
      fallbackResponse.arrayBuffer().then((body) => Buffer.from(body)),
    ]);
    if (sha256(r2Bytes) !== expectedSha || sha256(fallbackBytes) !== expectedSha) {
      throw new Error('PDF search manifest verification hash mismatch');
    }

    console.log(
      JSON.stringify({
        event: 'pdf_preview_search_manifest_dual_mirrored',
        documentId,
        pages: pages.length,
        bytes: manifest.length,
        sha256: expectedSha,
      }),
    );
    return { pageCount: pages.length };
  } catch (error) {
    // Fail-safe: if either private object copy cannot be written and verified,
    // preserve the historical PostgreSQL RPC below for this job.
    console.warn(
      JSON.stringify({
        event: 'pdf_preview_search_manifest_mirror_failed',
        requestUrl,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
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
    const mirrored = await mirrorPdfSearchManifest(input, init, requestUrl);
    if (mirrored) {
      // supabase-js expects the RPC to return the number of stored pages. Once
      // both object copies have been SHA-verified, return the same contract
      // without duplicating that page text into PostgreSQL.
      return new Response(JSON.stringify(mirrored.pageCount), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
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

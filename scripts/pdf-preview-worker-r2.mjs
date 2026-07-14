import { putPrivateR2Object } from './r2-s3.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const r2Bucket = process.env.R2_PDF_PREVIEW_BUCKET?.trim();
if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
if (!r2Bucket) throw new Error('R2_PDF_PREVIEW_BUCKET is required');

const nativeFetch = globalThis.fetch.bind(globalThis);
const storagePrefix = `${supabaseUrl}/storage/v1/object/`;

function headerValue(headers, name) {
  return new Headers(headers || {}).get(name);
}

async function bodyBuffer(body) {
  if (body == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

globalThis.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (!requestUrl.startsWith(storagePrefix) || !['POST', 'PUT'].includes(method)) {
    return nativeFetch(input, init);
  }

  const parsed = new URL(requestUrl);
  const encodedObject = parsed.pathname.slice('/storage/v1/object/'.length);
  const [requestedBucket, ...keyParts] = encodedObject.split('/');
  if (!requestedBucket || !keyParts.length) return nativeFetch(input, init);

  const key = keyParts.map(decodeURIComponent).join('/');
  const bytes = await bodyBuffer(init.body ?? (input instanceof Request ? input.body : null));
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

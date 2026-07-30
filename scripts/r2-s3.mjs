import { createHash, createHmac } from 'node:crypto';

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function r2Configuration() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    accessKeyId,
    secretAccessKey,
  };
}

export function assertR2Configured() {
  const configuration = r2Configuration();
  if (!configuration) {
    throw new Error(
      'R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required for private R2 access',
    );
  }
  return configuration;
}

async function signedR2Request({
  method,
  bucket,
  key,
  body,
  contentType,
  cacheControl,
  sha256Metadata,
  query,
  signal,
}) {
  const configuration = assertR2Configured();
  if (!bucket?.trim()) throw new Error('R2 bucket is required');
  if (key != null && !key.trim())
    throw new Error('R2 object key cannot be empty');

  const endpoint = new URL(configuration.endpoint);
  const basePath = endpoint.pathname.replace(/\/+$/, '');
  const encodedKey =
    key == null ? null : key.split('/').map(encodePathSegment).join('/');
  endpoint.pathname =
    `${basePath}/${encodePathSegment(bucket)}` +
    (encodedKey == null ? '' : `/${encodedKey}`);
  const canonicalQuery = Object.entries(query || {})
    .filter(([, value]) => value != null)
    .map(([name, value]) => [
      encodePathSegment(name),
      encodePathSegment(String(value)),
    ])
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue),
    )
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
  endpoint.search = canonicalQuery;

  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const signedHeaderValues = {
    host: endpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) signedHeaderValues['content-type'] = contentType;
  if (cacheControl) signedHeaderValues['cache-control'] = cacheControl;
  if (sha256Metadata)
    signedHeaderValues['x-amz-meta-sha256'] = sha256Metadata;

  const headerNames = Object.keys(signedHeaderValues).sort();
  const canonicalHeaders = `${headerNames.map((name) => `${name}:${String(signedHeaderValues[name]).trim().replace(/\s+/g, ' ')}`).join('\n')}\n`;
  const signedHeaders = headerNames.join(';');
  const canonicalRequest = [
    method,
    endpoint.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const dateKey = hmac(`AWS4${configuration.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign)
    .digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${configuration.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  if (cacheControl) headers['cache-control'] = cacheControl;
  if (sha256Metadata) headers['x-amz-meta-sha256'] = sha256Metadata;

  return fetch(endpoint, {
    method,
    body: ['GET', 'HEAD', 'DELETE'].includes(method) ? undefined : payload,
    cache: 'no-store',
    signal,
    headers,
  });
}

async function errorFromResponse(prefix, response) {
  const details = (await response.text().catch(() => '')).slice(0, 500);
  const error = new Error(
    `${prefix} failed with status ${response.status}${details ? `: ${details}` : ''}`,
  );
  error.statusCode = response.status;
  return error;
}

export async function putPrivateR2Object({
  bucket,
  key,
  body,
  contentType = 'application/octet-stream',
  cacheControl = 'private, max-age=31536000, immutable',
  sha256Metadata,
  signal,
}) {
  const response = await signedR2Request({
    method: 'PUT',
    bucket,
    key,
    body,
    contentType,
    cacheControl,
    sha256Metadata,
    signal,
  });
  if (response.ok) return { etag: response.headers.get('etag') };
  throw await errorFromResponse('R2 upload', response);
}

export async function getPrivateR2Object({ bucket, key, signal }) {
  const response = await signedR2Request({
    method: 'GET',
    bucket,
    key,
    signal,
  });
  if (response.ok || response.status === 404) return response;
  throw await errorFromResponse('R2 read', response);
}

export async function headPrivateR2Object({ bucket, key, signal }) {
  const response = await signedR2Request({
    method: 'HEAD',
    bucket,
    key,
    signal,
  });
  if (response.ok || response.status === 404) return response;
  throw await errorFromResponse('R2 metadata read', response);
}

export async function headPrivateR2Bucket({ bucket, signal }) {
  const response = await signedR2Request({
    method: 'HEAD',
    bucket,
    key: null,
    signal,
  });
  if (response.ok) return response;
  throw await errorFromResponse('R2 bucket verification', response);
}

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function xmlValue(body, name) {
  const match = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]) : null;
}

export async function listPrivateR2Objects({
  bucket,
  prefix = '',
  continuationToken = null,
  signal,
}) {
  const response = await signedR2Request({
    method: 'GET',
    bucket,
    key: null,
    query: {
      'list-type': '2',
      prefix,
      ...(continuationToken
        ? { 'continuation-token': continuationToken }
        : {}),
    },
    signal,
  });
  if (!response.ok) throw await errorFromResponse('R2 object listing', response);
  const body = await response.text();
  const objects = [...body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(
    (match) => ({
      key: xmlValue(match[1], 'Key'),
      size: Number(xmlValue(match[1], 'Size') || 0),
      etag: xmlValue(match[1], 'ETag'),
    }),
  );
  return {
    objects,
    isTruncated: xmlValue(body, 'IsTruncated') === 'true',
    nextContinuationToken: xmlValue(body, 'NextContinuationToken'),
  };
}

export async function deletePrivateR2Object({ bucket, key, signal }) {
  const response = await signedR2Request({
    method: 'DELETE',
    bucket,
    key,
    signal,
  });
  if (response.ok || response.status === 404) return;
  throw await errorFromResponse('R2 cleanup', response);
}

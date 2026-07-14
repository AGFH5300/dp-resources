import { createHash, createHmac } from 'node:crypto';

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function r2Configuration() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.R2_ENDPOINT?.trim() || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint: endpoint.replace(/\/+$/, ''), accessKeyId, secretAccessKey };
}

export function assertR2Configured() {
  const configuration = r2Configuration();
  if (!configuration) {
    throw new Error('R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required for R2 previews');
  }
  return configuration;
}

async function signedR2Request({ method, bucket, key, body, contentType, cacheControl, signal }) {
  const configuration = assertR2Configured();
  if (!bucket?.trim() || !key?.trim()) throw new Error('R2 bucket and object key are required');

  const endpoint = new URL(configuration.endpoint);
  const basePath = endpoint.pathname.replace(/\/+$/, '');
  const encodedKey = key.split('/').map(encodePathSegment).join('/');
  endpoint.pathname = `${basePath}/${encodePathSegment(bucket)}/${encodedKey}`;
  endpoint.search = '';

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

  const headerNames = Object.keys(signedHeaderValues).sort();
  const canonicalHeaders = `${headerNames.map((name) => `${name}:${String(signedHeaderValues[name]).trim().replace(/\s+/g, ' ')}`).join('\n')}\n`;
  const signedHeaders = headerNames.join(';');
  const canonicalRequest = [method, endpoint.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const dateKey = hmac(`AWS4${configuration.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${configuration.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  if (cacheControl) headers['cache-control'] = cacheControl;

  return fetch(endpoint, {
    method,
    body: method === 'GET' || method === 'HEAD' ? undefined : payload,
    cache: 'no-store',
    signal,
    headers,
  });
}

export async function putPrivateR2Object({ bucket, key, body, contentType = 'application/octet-stream', cacheControl = 'private, max-age=31536000, immutable', signal }) {
  const response = await signedR2Request({
    method: 'PUT',
    bucket,
    key,
    body,
    contentType,
    cacheControl,
    signal,
  });
  if (response.ok) return { etag: response.headers.get('etag') };
  const details = (await response.text().catch(() => '')).slice(0, 500);
  const error = new Error(`R2 upload failed with status ${response.status}${details ? `: ${details}` : ''}`);
  error.statusCode = response.status;
  throw error;
}

import 'server-only';

import { createHash, createHmac } from 'node:crypto';

function sha256Hex(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function encodePathSegment(value: string) {
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

export function isR2PdfPreviewConfigured() {
  return Boolean(r2Configuration());
}

async function signedR2Request(input: {
  method: 'GET';
  bucket: string;
  key: string;
  signal?: AbortSignal;
}) {
  const configuration = r2Configuration();
  if (!configuration) throw new Error('R2 PDF preview storage is not configured');
  if (!input.bucket.trim() || !input.key.trim()) throw new Error('R2 bucket and object key are required');

  const endpoint = new URL(configuration.endpoint);
  const basePath = endpoint.pathname.replace(/\/+$/, '');
  const encodedKey = input.key.split('/').map(encodePathSegment).join('/');
  endpoint.pathname = `${basePath}/${encodePathSegment(input.bucket)}/${encodedKey}`;
  endpoint.search = '';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex('');
  const canonicalHeaders = `host:${endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [input.method, endpoint.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const dateKey = hmac(`AWS4${configuration.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${configuration.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(endpoint, {
    method: input.method,
    cache: 'no-store',
    signal: input.signal,
    headers: {
      authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  });
}

export function getPrivateR2Object(bucket: string, key: string, signal?: AbortSignal) {
  return signedR2Request({ method: 'GET', bucket, key, signal });
}

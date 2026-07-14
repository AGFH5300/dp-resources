import { randomUUID } from 'node:crypto';
import { deletePrivateR2Object, getPrivateR2Object, putPrivateR2Object } from './r2-s3.mjs';

const bucket = process.env.R2_PDF_PREVIEW_BUCKET?.trim();
if (!bucket) throw new Error('R2_PDF_PREVIEW_BUCKET is required');

const key = `_preflight/github-${process.env.GITHUB_RUN_ID || 'local'}-${randomUUID()}.txt`;
const payload = Buffer.from(`dp-resources-pdf-preview-preflight:${randomUUID()}`, 'utf8');
let uploaded = false;

try {
  await putPrivateR2Object({
    bucket,
    key,
    body: payload,
    contentType: 'text/plain; charset=utf-8',
    cacheControl: 'private, no-store',
  });
  uploaded = true;

  const response = await getPrivateR2Object({ bucket, key });
  if (!response.ok) throw new Error(`R2 preflight object was not readable (status ${response.status})`);
  const downloaded = Buffer.from(await response.arrayBuffer());
  if (!downloaded.equals(payload)) throw new Error('R2 preflight read did not match the uploaded bytes');

  console.log(JSON.stringify({ event: 'pdf_preview_r2_preflight_ready', bucket }));
} finally {
  if (uploaded) await deletePrivateR2Object({ bucket, key });
}

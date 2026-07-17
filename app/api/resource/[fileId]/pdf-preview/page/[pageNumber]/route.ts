import { PDF_PREVIEW_BUCKET } from '@/lib/pdf-preview-derivatives';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';
import { getPrivateR2Object } from '@/lib/r2-s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getSupabaseObject(
  bucket: string,
  objectPath: string,
  signal: AbortSignal,
) {
  const storageBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!storageBaseUrl || !serviceRoleKey) return null;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const encodedBucket = encodeURIComponent(bucket);
  const storageUrl = `${storageBaseUrl}/storage/v1/object/authenticated/${encodedBucket}/${encodedPath}`;
  return fetch(storageUrl, {
    cache: 'no-store',
    signal,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  }).catch(() => null);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string; pageNumber: string }> },
) {
  const { fileId, pageNumber: pageNumberRaw } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session)
    return new Response('Invalid or expired PDF preview session', {
      status: 401,
    });

  const pageNumber = Number(pageNumberRaw);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1)
    return new Response('Invalid page number', { status: 400 });
  const requestedVersion = new URL(req.url).searchParams.get('v');
  if (requestedVersion !== session.previewVersionKey)
    return new Response('PDF preview version changed', {
      status: 409,
      headers: { 'cache-control': 'private, no-store' },
    });

  // Sessions issued before provider-aware storage did not contain these fields.
  // Preserve their exact original deterministic Supabase object path.
  const storageProvider = session.previewStorageProvider || 'supabase';
  const storageBucket = session.previewStorageBucket || PDF_PREVIEW_BUCKET;
  const storagePrefix =
    session.previewStoragePrefix ||
    `${session.fileId}/${session.previewVersionKey}`;
  const objectPath = `${storagePrefix}/page-${pageNumber}.jpg`;

  let upstream: Response | null = null;
  if (storageProvider === 'r2') {
    upstream = await getPrivateR2Object(
      storageBucket,
      objectPath,
      req.signal,
    ).catch(() => null);
  } else {
    upstream = await getSupabaseObject(storageBucket, objectPath, req.signal);
  }

  if (upstream?.status === 404)
    return new Response('PDF page is not ready', {
      status: 404,
      headers: { 'cache-control': 'private, no-store' },
    });
  if (!upstream?.ok || !upstream.body)
    return new Response('Unable to retrieve PDF page', {
      status: upstream ? 502 : 503,
    });

  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') || 'image/jpeg',
    'cache-control': 'private, max-age=31536000, immutable',
    vary: 'Cookie',
    'x-content-type-options': 'nosniff',
  });
  for (const name of ['content-length', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, { status: 200, headers });
}

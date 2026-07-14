import { PDF_PREVIEW_BUCKET } from '@/lib/pdf-preview-derivatives';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string; pageNumber: string }> }) {
  const { fileId, pageNumber: pageNumberRaw } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session) return new Response('Invalid or expired PDF preview session', { status: 401 });

  const pageNumber = Number(pageNumberRaw);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) return new Response('Invalid page number', { status: 400 });
  const requestedVersion = new URL(req.url).searchParams.get('v');
  if (requestedVersion !== session.previewVersionKey) return new Response('PDF preview version changed', {
    status: 409,
    headers: { 'cache-control': 'private, no-store' },
  });

  const storageBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!storageBaseUrl || !serviceRoleKey) return new Response('Unable to retrieve PDF page', { status: 503 });
  const objectPath = `${session.fileId}/${session.previewVersionKey}/page-${pageNumber}.jpg`;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const storageUrl = `${storageBaseUrl}/storage/v1/object/authenticated/${PDF_PREVIEW_BUCKET}/${encodedPath}`;
  const upstream = await fetch(storageUrl, {
    cache: 'no-store',
    signal: req.signal,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  }).catch(() => null);
  if (upstream?.status === 404) return new Response('PDF page is not ready', {
    status: 404,
    headers: { 'cache-control': 'private, no-store' },
  });
  if (!upstream?.ok || !upstream.body) return new Response('Unable to retrieve PDF page', { status: 502 });

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

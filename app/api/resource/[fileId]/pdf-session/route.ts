import { requireMember } from '@/lib/auth';
import { assertInsideRoot, getDriveMetadata, isDriveConfigured } from '@/lib/drive';
import { recordFileOpenedOnce } from '@/lib/activity';
import { getIndexedResourceShell } from '@/lib/indexed-resource';
import { getPdfPreviewDocument, isPdfPreviewViewable } from '@/lib/pdf-preview-derivatives';
import {
  createPdfPreviewSession,
  PDF_PREVIEW_SESSION_TTL_SECONDS,
  pdfPreviewSessionCookieName,
  pdfPreviewSessionCookiePath,
} from '@/lib/pdf-preview-session';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { user } = await requireMember();
  if (!isDriveConfigured()) return new Response('Resources are not yet available', { status: 503 });

  const { fileId } = await params;
  const limited = await rateLimit(
    privacySafeRequestKey(req, `pdf-preview-session:${user.id}`),
    60,
    10 * 60 * 1000,
    'pdf-preview-session',
  );
  if (!limited.ok) return new Response('Too many preview requests. Please try again shortly.', { status: 429 });

  // Prefer the completed resource index, just like the normal content route. This avoids
  // rejecting valid indexed files when a live parent-chain lookup is temporarily unavailable.
  const indexedMeta = await getIndexedResourceShell(fileId);
  if (!indexedMeta && !(await assertInsideRoot(fileId))) return new Response('Not found', { status: 404 });
  const meta = indexedMeta || await getDriveMetadata(fileId);
  if (!meta || meta.isFolder) return new Response('Not found', { status: 404 });
  if (meta.mimeType !== 'application/pdf' && !/\.pdf$/i.test(meta.name)) return new Response('Not a PDF', { status: 415 });

  const size = Number(meta.size);
  if (!Number.isSafeInteger(size) || size <= 0) return new Response('PDF size is unavailable', { status: 422 });

  // Web requests must never create work that Render Free cannot process. The manual GitHub
  // workflow prepares derivatives. Normal visits use an existing viewable derivative or fall
  // back immediately to the authenticated original PDF reader.
  let preview;
  try {
    preview = await getPdfPreviewDocument({
      fileId,
      size,
      modifiedTime: meta.modifiedTime,
    });
  } catch (error) {
    console.error('Unable to read PDF preview derivative', { fileId, error });
    return new Response('PDF preview availability is temporarily unavailable.', {
      status: 503,
      headers: {
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  if (!preview || !isPdfPreviewViewable(preview)) {
    return Response.json({
      mode: 'standard',
      status: preview?.status || 'unavailable',
      pageCount: preview?.page_count || null,
      pagesReady: preview?.pages_ready || 0,
      manifestUrl: null,
      statusUrl: null,
      standardUrl: `/api/resource/${encodeURIComponent(fileId)}/content`,
    }, {
      headers: {
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const session = createPdfPreviewSession({
    fileId,
    fileName: meta.name,
    mimeType: meta.mimeType || 'application/pdf',
    size,
    modifiedTime: meta.modifiedTime,
    userId: user.id,
    previewId: preview.id,
    previewVersionKey: preview.version_key,
    previewStorageProvider: preview.storage_provider,
    previewStorageBucket: preview.storage_bucket,
    previewStoragePrefix: preview.storage_prefix,
  });

  recordFileOpenedOnce(req, {
    userId: user.id,
    userEmail: user.email!,
    fileId,
    fileName: meta.name,
  }).catch(() => undefined);

  const cookie = [
    `${pdfPreviewSessionCookieName(fileId)}=${session.token}`,
    `Path=${pdfPreviewSessionCookiePath(fileId)}`,
    `Max-Age=${PDF_PREVIEW_SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  return Response.json({
    mode: 'prepared',
    expiresAt: session.expiresAt,
    status: preview.status,
    pageCount: preview.page_count,
    pagesReady: preview.pages_ready,
    manifestUrl: `/api/resource/${encodeURIComponent(fileId)}/pdf-preview/manifest`,
    statusUrl: `/api/resource/${encodeURIComponent(fileId)}/pdf-preview/status`,
  }, {
    headers: {
      'cache-control': 'private, no-store',
      'set-cookie': cookie,
      'x-content-type-options': 'nosniff',
    },
  });
}

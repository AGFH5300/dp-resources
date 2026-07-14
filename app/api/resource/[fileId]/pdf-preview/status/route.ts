import { getPdfPreviewDocumentByIdentity, isPdfPreviewViewable } from '@/lib/pdf-preview-derivatives';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session) return new Response('Invalid or expired PDF preview session', { status: 401 });

  const preview = await getPdfPreviewDocumentByIdentity(session.previewId, session.previewVersionKey).catch(() => null);
  if (!preview) return Response.json({ status: 'queued', pageCount: null, pagesReady: 0, manifestUrl: null }, {
    status: 202,
    headers: { 'cache-control': 'private, no-store' },
  });

  const viewable = isPdfPreviewViewable(preview);
  return Response.json({
    status: preview.status,
    pageCount: preview.page_count,
    pagesReady: preview.pages_ready,
    manifestUrl: viewable ? `/api/resource/${encodeURIComponent(fileId)}/pdf-preview/manifest` : null,
    message: preview.status === 'failed' ? 'PDF preview preparation failed' : undefined,
  }, {
    status: viewable ? 200 : 202,
    headers: {
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

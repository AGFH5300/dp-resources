import { getPdfPreviewManifestByIdentity, isPdfPreviewViewable } from '@/lib/pdf-preview-derivatives';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session) return new Response('Invalid or expired PDF preview session', { status: 401 });

  const manifest = await getPdfPreviewManifestByIdentity(session.previewId, session.previewVersionKey).catch(() => null);
  if (!manifest || !isPdfPreviewViewable(manifest.document)) {
    return Response.json({ status: manifest?.document.status || 'queued' }, {
      status: 202,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  return Response.json({
    status: manifest.document.status,
    versionKey: manifest.document.version_key,
    pageCount: manifest.document.page_count,
    pagesReady: manifest.document.pages_ready,
    searchReady: Boolean(manifest.document.text_ready_at && manifest.document.search_geometry_ready_at),
    pages: manifest.pages.map((page) => ({
      pageNumber: page.page_number,
      width: page.pixel_width,
      height: page.pixel_height,
      ready: Boolean(page.object_path && page.ready_at),
    })),
  }, {
    headers: {
      'cache-control': 'private, max-age=30, must-revalidate',
      'x-content-type-options': 'nosniff',
    },
  });
}

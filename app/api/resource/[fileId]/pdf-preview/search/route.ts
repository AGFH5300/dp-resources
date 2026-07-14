import { getPdfPreviewDocumentByIdentity } from '@/lib/pdf-preview-derivatives';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session) return new Response('Invalid or expired PDF preview session', { status: 401 });

  const url = new URL(req.url);
  const requestedVersion = url.searchParams.get('v');
  if (requestedVersion !== session.previewVersionKey) return new Response('PDF preview version changed', {
    status: 409,
    headers: { 'cache-control': 'private, no-store' },
  });

  const query = (url.searchParams.get('q') || '').trim();
  if (query.length < 2 || query.length > 100) {
    return Response.json({ ready: true, results: [], message: 'Enter between 2 and 100 characters.' }, {
      status: 400,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const document = await getPdfPreviewDocumentByIdentity(session.previewId, session.previewVersionKey).catch(() => null);
  if (!document?.text_ready_at) {
    return Response.json({ ready: false, results: [] }, {
      status: 202,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc('dp_search_pdf_preview', {
    p_document_id: session.previewId,
    p_query: query,
    p_limit: 100,
  });
  if (error) return new Response('Unable to search PDF preview', { status: 502 });

  return Response.json({
    ready: true,
    results: (data || []).map((result: { page_number: number; snippet: string | null }) => ({
      pageNumber: Number(result.page_number),
      snippet: result.snippet || '',
    })),
  }, {
    headers: {
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

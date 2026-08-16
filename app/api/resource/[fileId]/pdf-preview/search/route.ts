import {
  PDF_PREVIEW_BUCKET,
  getPdfPreviewDocumentByIdentity,
} from '@/lib/pdf-preview-derivatives';
import {
  findPdfSearchMatches,
  normalizePdfSearchText,
  validatePdfSearchGeometry,
} from '@/lib/pdf-search-geometry';
import {
  searchPdfSearchManifest,
  validatePdfSearchManifest,
} from '@/lib/pdf-search-manifest';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';
import { getPrivateR2Object } from '@/lib/r2-s3';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

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
  const storageUrl = `${storageBaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`;
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
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session)
    return new Response('Invalid or expired PDF preview session', {
      status: 401,
    });

  const url = new URL(req.url);
  const requestedVersion = url.searchParams.get('v');
  if (requestedVersion !== session.previewVersionKey)
    return new Response('PDF preview version changed', {
      status: 409,
      headers: { 'cache-control': 'private, no-store' },
    });

  const query = (url.searchParams.get('q') || '').trim();
  const normalizedQuery = normalizePdfSearchText(query);
  if (query.length < 2 || query.length > 100 || normalizedQuery.length < 2) {
    return Response.json(
      {
        ready: true,
        results: [],
        message: 'Enter between 2 and 100 searchable characters.',
      },
      {
        status: 400,
        headers: { 'cache-control': 'private, no-store' },
      },
    );
  }

  const document = await getPdfPreviewDocumentByIdentity(
    session.previewId,
    session.previewVersionKey,
  ).catch(() => null);
  if (!document?.text_ready_at || !document.search_geometry_ready_at) {
    return Response.json(
      { ready: false, results: [], exactHighlightsReady: false },
      {
        status: 202,
        headers: { 'cache-control': 'private, no-store' },
      },
    );
  }

  const storageProvider = session.previewStorageProvider || 'supabase';
  const storageBucket = session.previewStorageBucket || PDF_PREVIEW_BUCKET;
  const storagePrefix =
    session.previewStoragePrefix ||
    `${session.fileId}/${session.previewVersionKey}`;

  const requestedPage = url.searchParams.get('page');
  if (requestedPage !== null) {
    const pageNumber = Number(requestedPage);
    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > Number(document.page_count || 0)
    ) {
      return new Response('Invalid PDF search page', { status: 400 });
    }

    const objectPath = `${storagePrefix}/search/page-${pageNumber}.json`;
    const upstream =
      storageProvider === 'r2'
        ? await getPrivateR2Object(storageBucket, objectPath, req.signal).catch(
            () => null,
          )
        : await getSupabaseObject(storageBucket, objectPath, req.signal);

    if (upstream?.status === 404) {
      return Response.json(
        { ready: false, pageNumber, matches: [] },
        {
          status: 202,
          headers: { 'cache-control': 'private, no-store' },
        },
      );
    }
    if (!upstream?.ok)
      return new Response('Unable to retrieve PDF search geometry', {
        status: upstream ? 502 : 503,
      });

    const payload = validatePdfSearchGeometry(
      await upstream.json().catch(() => null),
      pageNumber,
    );
    if (!payload)
      return new Response('Invalid PDF search geometry', { status: 502 });
    const matches = findPdfSearchMatches(payload, normalizedQuery);

    return Response.json(
      { ready: true, exactHighlightsReady: true, pageNumber, matches },
      {
        headers: {
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
      },
    );
  }

  // R2-backed previews can carry their page-level text index outside Postgres.
  // During migration we retain the historical RPC as a complete fallback, so a
  // missing/corrupt object never makes an existing searchable preview regress.
  if (storageProvider === 'r2') {
    const manifestPath = `pdf-preview-search/${session.previewId}.json`;
    const manifestResponse = await getPrivateR2Object(
      storageBucket,
      manifestPath,
      req.signal,
    ).catch(() => null);
    if (manifestResponse?.ok) {
      const manifest = validatePdfSearchManifest(
        await manifestResponse.json().catch(() => null),
        session.previewId,
      );
      if (manifest) {
        return Response.json(
          {
            ready: true,
            exactHighlightsReady: true,
            results: searchPdfSearchManifest(
              manifest,
              normalizedQuery,
              Math.min(Math.max(Number(document.page_count || 1), 1), 5000),
            ),
          },
          {
            headers: {
              'cache-control': 'private, no-store',
              'x-content-type-options': 'nosniff',
              'x-pdf-search-source': 'r2-manifest',
            },
          },
        );
      }
    }
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc('dp_search_pdf_preview', {
    p_document_id: session.previewId,
    p_query: normalizedQuery,
    p_limit: Math.min(Math.max(Number(document.page_count || 1), 1), 5000),
  });
  if (error)
    return new Response('Unable to search PDF preview', { status: 502 });

  return Response.json(
    {
      ready: true,
      exactHighlightsReady: true,
      results: (data || []).map(
        (result: { page_number: number; snippet: string | null }) => ({
          pageNumber: Number(result.page_number),
          snippet: result.snippet || '',
        }),
      ),
    },
    {
      headers: {
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'x-pdf-search-source': 'postgres-fallback',
      },
    },
  );
}

import { PDF_PREVIEW_BUCKET, getPdfPreviewDocumentByIdentity } from '@/lib/pdf-preview-derivatives';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';
import { getPrivateR2Object } from '@/lib/r2-s3';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GeometryWord = [string, number, number, number, number, number];
type GeometryPayload = { v: number; p: number; w: GeometryWord[] };
type Segment = { start: number; end: number; word: GeometryWord };
type Rect = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const normalize = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function getSupabaseObject(bucket: string, objectPath: string, signal: AbortSignal) {
  const storageBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!storageBaseUrl || !serviceRoleKey) return null;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const storageUrl = `${storageBaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`;
  return fetch(storageUrl, {
    cache: 'no-store',
    signal,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  }).catch(() => null);
}

function validGeometry(value: unknown, pageNumber: number): GeometryPayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GeometryPayload>;
  if (candidate.v !== 1 || candidate.p !== pageNumber || !Array.isArray(candidate.w)) return null;
  const words = candidate.w.filter((word): word is GeometryWord => Array.isArray(word)
    && word.length === 6
    && typeof word[0] === 'string'
    && word.slice(1).every((part) => typeof part === 'number' && Number.isFinite(part)));
  return words.length === candidate.w.length ? { v: 1, p: pageNumber, w: words } : null;
}

function mergeWords(words: GeometryWord[]): Rect[] {
  const rects: Rect[] = [];
  for (const word of words) {
    const [, x, y, width, height, line] = word;
    const previous = rects[rects.length - 1] as (Rect & { line?: number }) | undefined;
    const right = x + width;
    if (previous && previous.line === line && x - (previous.x + previous.width) <= 0.018) {
      previous.width = clamp(Math.max(previous.x + previous.width, right) - previous.x, 0, 1 - previous.x);
      previous.y = Math.min(previous.y, y);
      previous.height = Math.max(previous.y + previous.height, y + height) - previous.y;
    } else {
      rects.push({
        x: clamp(x - 0.002),
        y: clamp(y - 0.0015),
        width: clamp(width + 0.004, 0.002, 1 - clamp(x - 0.002)),
        height: clamp(height + 0.003, 0.003, 1 - clamp(y - 0.0015)),
        line,
      } as Rect & { line: number });
    }
  }
  return rects.map(({ x, y, width, height }) => ({ x, y, width, height }));
}

function exactMatches(payload: GeometryPayload, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  let pageText = '';
  const segments: Segment[] = [];
  for (const word of payload.w) {
    const token = normalize(word[0]);
    if (!token) continue;
    if (pageText) pageText += ' ';
    const start = pageText.length;
    pageText += token;
    segments.push({ start, end: pageText.length, word });
  }
  const matches: { rects: Rect[] }[] = [];
  let from = 0;
  while (from <= pageText.length - normalizedQuery.length) {
    const index = pageText.indexOf(normalizedQuery, from);
    if (index < 0) break;
    const end = index + normalizedQuery.length;
    const words = segments.filter((segment) => segment.end > index && segment.start < end).map((segment) => segment.word);
    if (words.length) matches.push({ rects: mergeWords(words) });
    from = index + Math.max(1, normalizedQuery.length);
  }
  return matches;
}

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
  if (!document?.text_ready_at || !document.search_geometry_ready_at) {
    return Response.json({ ready: false, results: [], exactHighlightsReady: false }, {
      status: 202,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const requestedPage = url.searchParams.get('page');
  if (requestedPage !== null) {
    const pageNumber = Number(requestedPage);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > Number(document.page_count || 0)) {
      return new Response('Invalid PDF search page', { status: 400 });
    }
    const storageProvider = session.previewStorageProvider || 'supabase';
    const storageBucket = session.previewStorageBucket || PDF_PREVIEW_BUCKET;
    const storagePrefix = session.previewStoragePrefix || `${session.fileId}/${session.previewVersionKey}`;
    const objectPath = `${storagePrefix}/search/page-${pageNumber}.json`;
    const upstream = storageProvider === 'r2'
      ? await getPrivateR2Object(storageBucket, objectPath, req.signal).catch(() => null)
      : await getSupabaseObject(storageBucket, objectPath, req.signal);
    if (upstream?.status === 404) return Response.json({ ready: false, pageNumber, matches: [] }, { status: 202 });
    if (!upstream?.ok) return new Response('Unable to retrieve PDF search geometry', { status: upstream ? 502 : 503 });
    const payload = validGeometry(await upstream.json().catch(() => null), pageNumber);
    if (!payload) return new Response('Invalid PDF search geometry', { status: 502 });
    const matches = exactMatches(payload, query);
    return Response.json({ ready: true, exactHighlightsReady: true, pageNumber, matches }, {
      headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
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
    exactHighlightsReady: true,
    results: (data || []).map((result: { page_number: number; snippet: string | null }) => ({
      pageNumber: Number(result.page_number),
      snippet: result.snippet || '',
    })),
  }, {
    headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
}

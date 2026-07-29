import { createHash } from 'node:crypto';

import { requireMember } from '@/lib/auth';
import { getPrivateR2Object } from '@/lib/r2-s3';
import { rateLimit } from '@/lib/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ByteRange = { start: number; end: number };

function parseByteRange(value: string | null, byteSize: number): ByteRange | null | false {
  if (!value) return null;
  const match = value.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2]) || byteSize <= 0) return false;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return false;
    return {
      start: Math.max(0, byteSize - suffixLength),
      end: byteSize - 1,
    };
  }

  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start < 0 || start >= byteSize) return false;
  const requestedEnd = match[2] ? Number(match[2]) : byteSize - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return false;
  return { start, end: Math.min(requestedEnd, byteSize - 1) };
}

function assetHeaders(contentType: string, contentLength: number) {
  return {
    'Content-Type': contentType,
    'Content-Length': String(contentLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

function rangeNotSatisfiable(contentType: string, byteSize: number) {
  return new Response(null, {
    status: 416,
    headers: {
      ...assetHeaders(contentType, 0),
      'Content-Range': `bytes */${byteSize}`,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { user } = await requireMember();
  const { assetId } = await params;
  if (!UUID_PATTERN.test(assetId))
    return Response.json({ error: 'Asset not found.' }, { status: 404 });
  const key = createHash('sha256')
    .update(`question-bank-asset:${user.id}`)
    .digest('hex');
  const limit = await rateLimit(key, 360, 60_000, 'question_bank_asset');
  if (!limit.ok)
    return Response.json(
      { error: 'Too many asset requests.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter || 60) } },
    );

  const admin = createSupabaseAdminClient();
  const { data: asset, error } = await admin
    .from('dp_qb_assets')
    .select(
      'id,content_type,byte_size,storage_provider,storage_bucket,storage_key,verification_status',
    )
    .eq('id', assetId)
    .eq('verification_status', 'verified')
    .maybeSingle();
  if (error || !asset)
    return Response.json({ error: 'Asset not found.' }, { status: 404 });

  const byteSize = Number(asset.byte_size);
  const range = parseByteRange(request.headers.get('range'), byteSize);
  if (range === false) return rangeNotSatisfiable(asset.content_type, byteSize);
  const normalizedRange = range ? `bytes=${range.start}-${range.end}` : undefined;
  const responseLength = range ? range.end - range.start + 1 : byteSize;

  if (asset.storage_provider === 'r2') {
    const stored = await getPrivateR2Object(
      asset.storage_bucket,
      asset.storage_key,
      request.signal,
      normalizedRange,
    );
    if (stored.status === 416)
      return rangeNotSatisfiable(asset.content_type, byteSize);
    if (!stored.ok || !stored.body)
      return Response.json({ error: 'Asset unavailable.' }, { status: 404 });

    let expectedContentRange: string | null = null;
    if (range) {
      expectedContentRange = `bytes ${range.start}-${range.end}/${byteSize}`;
      const upstreamContentRange = stored.headers.get('content-range')?.trim();
      const upstreamLength = Number(stored.headers.get('content-length'));
      if (
        stored.status !== 206 ||
        upstreamContentRange?.toLowerCase() !== expectedContentRange.toLowerCase() ||
        (Number.isFinite(upstreamLength) && upstreamLength !== responseLength)
      ) {
        await stored.body.cancel().catch(() => undefined);
        return Response.json(
          { error: 'Asset range unavailable.' },
          { status: 502 },
        );
      }
    }

    const headers = new Headers(assetHeaders(asset.content_type, responseLength));
    if (expectedContentRange) headers.set('Content-Range', expectedContentRange);
    for (const name of ['etag', 'last-modified']) {
      const value = stored.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(stored.body, { status: range ? 206 : 200, headers });
  }

  if (asset.storage_provider === 'supabase') {
    const { data, error: storageError } = await admin.storage
      .from(asset.storage_bucket)
      .download(asset.storage_key);
    if (storageError || !data)
      return Response.json({ error: 'Asset unavailable.' }, { status: 404 });
    if (range) {
      const partial = data.slice(range.start, range.end + 1, asset.content_type);
      return new Response(partial.stream(), {
        status: 206,
        headers: {
          ...assetHeaders(asset.content_type, partial.size),
          'Content-Range': `bytes ${range.start}-${range.end}/${byteSize}`,
        },
      });
    }
    return new Response(data.stream(), {
      status: 200,
      headers: assetHeaders(asset.content_type, byteSize),
    });
  }

  return Response.json({ error: 'Asset unavailable.' }, { status: 404 });
}

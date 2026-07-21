import { createHash } from 'node:crypto';

import { requireMember } from '@/lib/auth';
import { getPrivateR2Object } from '@/lib/r2-s3';
import { rateLimit } from '@/lib/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assetHeaders(contentType: string, byteSize: number) {
  return {
    'Content-Type': contentType,
    'Content-Length': String(byteSize),
    'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
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
  const headers = assetHeaders(asset.content_type, Number(asset.byte_size));

  if (asset.storage_provider === 'r2') {
    const stored = await getPrivateR2Object(
      asset.storage_bucket,
      asset.storage_key,
      request.signal,
    );
    if (!stored.ok || !stored.body)
      return Response.json({ error: 'Asset unavailable.' }, { status: 404 });
    return new Response(stored.body, { status: 200, headers });
  }

  if (asset.storage_provider === 'supabase') {
    const { data, error: storageError } = await admin.storage
      .from(asset.storage_bucket)
      .download(asset.storage_key);
    if (storageError || !data)
      return Response.json({ error: 'Asset unavailable.' }, { status: 404 });
    return new Response(data.stream(), { status: 200, headers });
  }

  return Response.json({ error: 'Asset unavailable.' }, { status: 404 });
}

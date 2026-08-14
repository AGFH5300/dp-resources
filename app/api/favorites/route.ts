import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const MAX_FAVORITE_BODY_BYTES = 4 * 1024;
const MAX_DRIVE_FILE_ID_LENGTH = 200;

function validDriveFileId(value: unknown) {
  const driveFileId = String(value || '').trim();
  return driveFileId && driveFileId.length <= MAX_DRIVE_FILE_ID_LENGTH
    ? driveFileId
    : null;
}

export async function GET() {
  const { user } = await requireMember();
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_resource_favorites')
    .select('drive_file_id,created_at')
    .eq('user_id', user.id);
  if (error) {
    console.error('[favorites] list failed', {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: 'Could not load saved resources.' },
      { status: 500 },
    );
  }
  return Response.json(
    { favorites: data || [] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(req: Request) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_FAVORITE_BODY_BYTES
  ) {
    return Response.json({ error: 'Request body is too large.' }, { status: 413 });
  }
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_FAVORITE_BODY_BYTES) {
    return Response.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Expected JSON request body' }, { status: 400 });
  }
  const driveFileId = validDriveFileId(body?.driveFileId);
  if (!driveFileId)
    return Response.json({ error: 'Missing or invalid resource' }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { error } = await sb
    .from('dp_resource_favorites')
    .upsert(
      { user_id: user.id, drive_file_id: driveFileId },
      { onConflict: 'user_id,drive_file_id' },
    );
  if (error) {
    console.error('[favorites] save failed', {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: 'Could not save resource.' },
      { status: 500 },
    );
  }
  return Response.json(
    { saved: true },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function DELETE(req: Request) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const driveFileId = validDriveFileId(
    new URL(req.url).searchParams.get('driveFileId'),
  );
  if (!driveFileId)
    return Response.json({ error: 'Missing or invalid resource' }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { error } = await sb
    .from('dp_resource_favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('drive_file_id', driveFileId);
  if (error) {
    console.error('[favorites] delete failed', {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: 'Could not remove saved resource.' },
      { status: 500 },
    );
  }
  return Response.json(
    { saved: false },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const REPORT_CATEGORIES = new Set([
  'Broken file',
  'Incorrect resource',
  'Outdated content',
  'Duplicate',
  'Broken image or diagram',
  'Broken audio or transcript',
  'Broken solution video',
  'Wrong answer or markscheme',
  'Question text or layout problem',
  'Wrong topic or metadata',
  'Duplicate question',
  'Other',
]);
const MAX_REPORT_BODY_BYTES = 16 * 1024;
const MAX_REPORT_MESSAGE_LENGTH = 5000;
const MAX_RESOURCE_NAME_LENGTH = 500;
const MAX_RESOURCE_PATH_LENGTH = 2000;
const MAX_DRIVE_FILE_ID_LENGTH = 200;

export async function POST(req: Request) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireMember();
  const limited = await rateLimit(
    privacySafeRequestKey(req, 'report-create'),
    10,
    60 * 60 * 1000,
    'report-create',
  );
  if (!limited.ok)
    return Response.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REPORT_BODY_BYTES
  ) {
    return Response.json({ error: 'Report is too large.' }, { status: 413 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REPORT_BODY_BYTES) {
    return Response.json({ error: 'Report is too large.' }, { status: 413 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Expected JSON request body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Expected JSON request body' }, { status: 400 });
  }

  const driveFileId = String(body.driveFileId || '').trim();
  const resourceName = String(body.resourceName || '').trim();
  const resourcePath = String(body.resourcePath || '').trim();
  const category = String(body.category || '').trim();
  const message = String(body.message || '').trim();

  if (!REPORT_CATEGORIES.has(category))
    return Response.json({ error: 'Invalid report category.' }, { status: 400 });
  if (!message)
    return Response.json({ error: 'Report message is required.' }, { status: 400 });
  if (message.length > MAX_REPORT_MESSAGE_LENGTH)
    return Response.json({ error: 'Report message is too long.' }, { status: 400 });
  if (resourceName.length > MAX_RESOURCE_NAME_LENGTH)
    return Response.json({ error: 'Resource name is too long.' }, { status: 400 });
  if (resourcePath.length > MAX_RESOURCE_PATH_LENGTH)
    return Response.json({ error: 'Resource path is too long.' }, { status: 400 });
  if (driveFileId.length > MAX_DRIVE_FILE_ID_LENGTH)
    return Response.json({ error: 'Invalid resource identifier.' }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { error } = await sb.from('dp_resource_reports').insert({
    reporter_id: user.id,
    reporter_email: user.email,
    drive_file_id: driveFileId || null,
    resource_name: resourceName || null,
    resource_path: resourcePath || null,
    category,
    message,
  });
  if (error) {
    console.error('[resource-report] insert failed', {
      code: error.code,
      message: error.message,
    });
    return Response.json({ error: 'Could not submit report.' }, { status: 500 });
  }
  return Response.json(
    { ok: true },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

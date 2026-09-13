import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
import { CASE_ATTACHMENT_MAX_REQUEST_BYTES } from '@/lib/case-attachment-rules';
import {
  CaseAttachmentError,
  caseAttachmentFiles,
  persistCaseAttachments,
  prepareCaseAttachments,
  type PreparedCaseAttachment,
} from '@/lib/case-attachments';

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

function attachmentError(error: unknown) {
  if (error instanceof CaseAttachmentError) {
    const publicMessage = error.message;
    return Response.json({ error: publicMessage }, { status: error.status });
  }
  console.error('[resource-report] unexpected attachment failure', {
    message: error instanceof Error ? error.message : 'unknown',
  });
  return Response.json(
    { error: 'Unable to process attachments.' },
    { status: 503 },
  );
}

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

  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  const multipart = contentType.startsWith('multipart/form-data');
  const declaredLength = Number(req.headers.get('content-length') || 0);
  const requestLimit = multipart
    ? CASE_ATTACHMENT_MAX_REQUEST_BYTES
    : MAX_REPORT_BODY_BYTES;
  if (Number.isFinite(declaredLength) && declaredLength > requestLimit) {
    return Response.json(
      { error: multipart ? 'Attachments are too large.' : 'Report is too large.' },
      { status: 413 },
    );
  }

  let driveFileId = '';
  let resourceName = '';
  let resourcePath = '';
  let category = '';
  let message = '';
  let uploadedFiles: File[] = [];

  if (multipart) {
    let formData: FormData;
    try {
      formData = await req.formData();
      driveFileId = String(formData.get('driveFileId') || '').trim();
      resourceName = String(formData.get('resourceName') || '').trim();
      resourcePath = String(formData.get('resourcePath') || '').trim();
      category = String(formData.get('category') || '').trim();
      message = String(formData.get('message') || '').trim();
      uploadedFiles = caseAttachmentFiles(formData);
    } catch (error) {
      if (error instanceof CaseAttachmentError) return attachmentError(error);
      return Response.json({ error: 'Invalid report.' }, { status: 400 });
    }
  } else {
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

    driveFileId = String(body.driveFileId || '').trim();
    resourceName = String(body.resourceName || '').trim();
    resourcePath = String(body.resourcePath || '').trim();
    category = String(body.category || '').trim();
    message = String(body.message || '').trim();
  }

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

  let preparedAttachments: PreparedCaseAttachment[] = [];
  if (uploadedFiles.length) {
    try {
      preparedAttachments = await prepareCaseAttachments(uploadedFiles);
    } catch (error) {
      return attachmentError(error);
    }
  }

  const sb = createSupabaseAdminClient();
  const { data: report, error } = await sb
    .from('dp_resource_reports')
    .insert({
      reporter_id: user.id,
      reporter_email: user.email,
      drive_file_id: driveFileId || null,
      resource_name: resourceName || null,
      resource_path: resourcePath || null,
      category,
      message,
    })
    .select('id')
    .single();
  if (error || !report) {
    console.error('[resource-report] insert failed', {
      code: error?.code,
      message: error?.message,
    });
    return Response.json({ error: 'Could not submit report.' }, { status: 500 });
  }

  if (preparedAttachments.length) {
    try {
      await persistCaseAttachments({
        kind: 'report',
        caseId: report.id,
        uploaderId: user.id,
        attachments: preparedAttachments,
      });
    } catch (attachmentFailure) {
      const { error: rollbackError } = await sb
        .from('dp_resource_reports')
        .delete()
        .eq('id', report.id);
      if (rollbackError) {
        console.error('[resource-report] failed to roll back after attachment failure', {
          code: rollbackError.code,
          message: rollbackError.message,
        });
      }
      return attachmentError(attachmentFailure);
    }
  }

  return Response.json(
    { ok: true, reportId: report.id },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

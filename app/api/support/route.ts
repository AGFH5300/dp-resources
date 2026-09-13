import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { privacySafeRequestKey, rateLimit } from '@/lib/rate-limit';
import {
  CASE_ATTACHMENT_MAX_REQUEST_BYTES,
} from '@/lib/case-attachment-rules';
import {
  CaseAttachmentError,
  caseAttachmentFiles,
  persistCaseAttachments,
  prepareCaseAttachments,
  type PreparedCaseAttachment,
} from '@/lib/case-attachments';

const SUPPORT_CATEGORIES = new Set([
  'Report a bug',
  'Request an improvement',
  'Content feedback',
  'Account help',
  'General inquiry',
]);
const MAX_SUPPORT_BODY_BYTES = 16 * 1024;
const MAX_SUPPORT_SUBJECT_LENGTH = 160;
const MAX_SUPPORT_MESSAGE_LENGTH = 5000;

function attachmentError(error: unknown) {
  if (error instanceof CaseAttachmentError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error('[support] unexpected attachment failure', {
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
    privacySafeRequestKey(req, 'support-create'),
    10,
    60 * 60 * 1000,
    'support-create',
  );
  if (!limited.ok)
    return Response.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );

  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  const multipart = contentType.startsWith('multipart/form-data');
  const contentLength = Number(req.headers.get('content-length') || 0);
  const requestLimit = multipart
    ? CASE_ATTACHMENT_MAX_REQUEST_BYTES
    : MAX_SUPPORT_BODY_BYTES;
  if (Number.isFinite(contentLength) && contentLength > requestLimit) {
    return Response.json(
      { error: multipart ? 'Attachments are too large.' : 'Support request is too large.' },
      { status: 413 },
    );
  }

  let category = '';
  let subject = '';
  let message = '';
  let uploadedFiles: File[] = [];

  if (multipart) {
    let formData: FormData;
    try {
      formData = await req.formData();
      category = String(formData.get('category') || '').trim();
      subject = String(formData.get('subject') || '').trim();
      message = String(formData.get('message') || '').trim();
      uploadedFiles = caseAttachmentFiles(formData);
    } catch (error) {
      if (error instanceof CaseAttachmentError) return attachmentError(error);
      return Response.json({ error: 'Invalid support request.' }, { status: 400 });
    }
  } else {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_SUPPORT_BODY_BYTES) {
      return Response.json(
        { error: 'Support request is too large.' },
        { status: 413 },
      );
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json(
        { error: 'Expected JSON request body' },
        { status: 400 },
      );
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return Response.json(
        { error: 'Expected JSON request body' },
        { status: 400 },
      );
    category = String(body.category || '').trim();
    subject = String(body.subject || '').trim();
    message = String(body.message || '').trim();
  }

  if (!category || !subject || !message)
    return Response.json(
      { error: 'Category, subject, and message are required' },
      { status: 400 },
    );
  if (!SUPPORT_CATEGORIES.has(category))
    return Response.json({ error: 'Invalid support category.' }, { status: 400 });
  if (subject.length > MAX_SUPPORT_SUBJECT_LENGTH)
    return Response.json(
      { error: 'Subject is too long.' },
      { status: 400 },
    );
  if (message.length > MAX_SUPPORT_MESSAGE_LENGTH)
    return Response.json(
      { error: 'Message is too long.' },
      { status: 400 },
    );

  let preparedAttachments: PreparedCaseAttachment[] = [];
  if (uploadedFiles.length) {
    try {
      preparedAttachments = await prepareCaseAttachments(uploadedFiles);
    } catch (error) {
      return attachmentError(error);
    }
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_support_tickets')
    .insert({
      reporter_id: user.id,
      reporter_email: user.email,
      category,
      subject,
      message,
    })
    .select('id,category,subject,message,status,created_at,updated_at')
    .single();
  if (error) {
    console.error('[support] ticket creation failed', {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: 'Unable to create support request.' },
      { status: 500 },
    );
  }

  if (preparedAttachments.length) {
    try {
      await persistCaseAttachments({
        kind: 'support',
        caseId: data.id,
        uploaderId: user.id,
        attachments: preparedAttachments,
      });
    } catch (attachmentFailure) {
      const { error: rollbackError } = await sb
        .from('dp_support_tickets')
        .delete()
        .eq('id', data.id);
      if (rollbackError) {
        console.error('[support] failed to roll back ticket after attachment failure', {
          code: rollbackError.code,
          message: rollbackError.message,
        });
      }
      return attachmentError(attachmentFailure);
    }
  }

  return Response.json(
    { ticket: data },
    {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}

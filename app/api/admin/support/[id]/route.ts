import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

const allowed = new Set(['open', 'in_review', 'resolved', 'closed']);
const MAX_ADMIN_SUPPORT_BODY_BYTES = 32 * 1024;
const MAX_INTERNAL_NOTES_LENGTH = 10000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireAdmin();
  const { id } = await params;

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_ADMIN_SUPPORT_BODY_BYTES
  ) {
    return Response.json({ error: 'Request body is too large' }, { status: 413 });
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_ADMIN_SUPPORT_BODY_BYTES) {
      return Response.json({ error: 'Request body is too large' }, { status: 413 });
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json(
        { error: 'Expected JSON request body' },
        { status: 400 },
      );
    }
    if (body.status && !allowed.has(body.status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (
      body.assigned_to !== undefined &&
      body.assigned_to !== null &&
      body.assigned_to !== '' &&
      (typeof body.assigned_to !== 'string' || !UUID_PATTERN.test(body.assigned_to))
    ) {
      return Response.json({ error: 'Invalid assignee' }, { status: 400 });
    }

    const requestedNotes =
      body.internal_notes !== undefined ? body.internal_notes : body.admin_notes;
    if (
      requestedNotes !== undefined &&
      requestedNotes !== null &&
      typeof requestedNotes !== 'string'
    ) {
      return Response.json({ error: 'Invalid internal notes' }, { status: 400 });
    }
    if (
      typeof requestedNotes === 'string' &&
      requestedNotes.length > MAX_INTERNAL_NOTES_LENGTH
    ) {
      return Response.json(
        { error: `Internal notes must be ${MAX_INTERNAL_NOTES_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };
    if ('status' in body) update.status = body.status || null;
    if ('assigned_to' in body) {
      update.assigned_to = body.assigned_to || null;
      update.assigned_at = body.assigned_to ? now : null;
    }
    if (requestedNotes !== undefined) {
      update.internal_notes = requestedNotes || null;
    }
    if (body.status === 'resolved' || body.status === 'closed') {
      update.resolved_at = now;
      update.resolved_by = user.id;
    } else if (body.status) {
      update.resolved_at = null;
      update.resolved_by = null;
    }

    const sb = createSupabaseAdminClient();
    const { data, error } = await sb
      .from('dp_support_tickets')
      .update(update)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      console.error('[admin-support-update] update failed', {
        code: error.code,
        message: error.message,
      });
      return Response.json(
        { error: 'Could not update support ticket' },
        { status: 500 },
      );
    }
    if (!data) {
      return Response.json(
        { error: 'Support ticket not found' },
        { status: 404 },
      );
    }
    return Response.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[admin-support-update] unexpected failure', {
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: 'Could not update support ticket' },
      { status: 500 },
    );
  }
}
/* Legacy QA marker: admin_notes migrated to internal_notes */

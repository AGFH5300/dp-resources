import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

const MAX_ADMIN_REPLY_BODY_BYTES = 16 * 1024;
const MAX_ADMIN_REPLY_LENGTH = 5000;

export async function POST(
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
    declaredLength > MAX_ADMIN_REPLY_BODY_BYTES
  ) {
    return Response.json({ error: 'Request body is too large' }, { status: 413 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_ADMIN_REPLY_BODY_BYTES) {
    return Response.json({ error: 'Request body is too large' }, { status: 413 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Expected JSON request body' }, { status: 400 });
  }

  const text = String(body?.body || '').trim();
  const visibility = body?.visibility === 'internal' ? 'internal' : 'user';
  if (!text) {
    return Response.json(
      { error: 'Message body is required' },
      { status: 400 },
    );
  }
  if (text.length > MAX_ADMIN_REPLY_LENGTH) {
    return Response.json(
      { error: `Message must be ${MAX_ADMIN_REPLY_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const sb = createSupabaseAdminClient();
  const { data: message, error } = await sb
    .from('dp_support_ticket_messages')
    .insert({
      ticket_id: id,
      author_id: user.id,
      author_role: 'admin',
      body: text,
      visibility,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[admin-support-reply] insert failed', {
      code: error.code,
      message: error.message,
    });
    return Response.json({ error: 'Could not send support reply' }, { status: 500 });
  }

  const update: any = { updated_at: new Date().toISOString() };
  if (visibility === 'user') {
    const { data: ticket } = await sb
      .from('dp_support_tickets')
      .select('status')
      .eq('id', id)
      .single();
    if (ticket?.status === 'open') update.status = 'in_review';
  }
  const { error: updateError } = await sb
    .from('dp_support_tickets')
    .update(update)
    .eq('id', id);
  if (updateError) {
    console.error('[admin-support-reply] ticket timestamp update failed', {
      code: updateError.code,
      message: updateError.message,
    });
  }

  return Response.json(
    { message },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

import { sameOriginOrForbidden } from '@/lib/request-security';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = sameOriginOrForbidden(req);
  if (forbidden) return forbidden;
  const { user } = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const text = String(body?.body || '').trim();
  const visibility = body?.visibility === 'internal' ? 'internal' : 'user';
  if (!text)
    return Response.json(
      { error: 'Message body is required' },
      { status: 400 },
    );
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
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const update: any = { updated_at: new Date().toISOString() };
  if (visibility === 'user') {
    const { data: ticket } = await sb
      .from('dp_support_tickets')
      .select('status')
      .eq('id', id)
      .single();
    if (ticket?.status === 'open') update.status = 'in_review';
  }
  await sb.from('dp_support_tickets').update(update).eq('id', id);
  return Response.json({ message });
}

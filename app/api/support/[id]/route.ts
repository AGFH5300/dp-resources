import { requireMember } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, membership } = await requireMember();
  const { id } = await params;
  const sb = createSupabaseAdminClient();
  let q = sb
    .from('dp_support_tickets')
    .select(
      'id,reporter_id,reporter_email,category,subject,message,status,created_at,updated_at,resolved_at',
    )
    .eq('id', id);
  if (membership.role !== 'admin') q = q.eq('reporter_id', user.id);
  const { data: ticket, error } = await q.single();
  if (error || !ticket) {
    if (error && error.code !== 'PGRST116') {
      console.error('[support-detail] ticket lookup failed', {
        code: error.code,
        message: error.message,
      });
    }
    return Response.json(
      { error: 'Ticket not found' },
      {
        status: 404,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
  const msgQ = sb
    .from('dp_support_ticket_messages')
    .select('id,ticket_id,author_id,author_role,body,created_at,visibility')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });
  const { data: messages, error: msgError } =
    membership.role === 'admin'
      ? await msgQ
      : await msgQ.eq('visibility', 'user');
  if (msgError) {
    console.error('[support-detail] message lookup failed', {
      code: msgError.code,
      message: msgError.message,
    });
    return Response.json(
      { error: 'Could not load ticket updates' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
  return Response.json(
    { ticket, messages: messages || [] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

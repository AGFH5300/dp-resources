import { requireMember } from '@/lib/auth';
import { sameOriginOrForbidden } from '@/lib/request-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const categoryKinds = {
  admin_tickets: ['support_ticket_created'],
  admin_reports: ['resource_report_created'],
  user_tickets: ['ticket_reply', 'ticket_status'],
} as const;

const userTicketKinds = new Set<string>(categoryKinds.user_tickets);

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET() {
  const { user } = await requireMember();
  const sb = createSupabaseAdminClient();

  const [feed, unread, adminTickets, adminReports, userTickets, settings] =
    await Promise.all([
      sb
        .from('dp_notifications')
        .select(
          'id,recipient_id,audience,kind,title,message,href,support_ticket_id,resource_report_id,created_at,read_at',
        )
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30),
      sb
        .from('dp_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .is('read_at', null),
      sb
        .from('dp_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('kind', 'support_ticket_created')
        .is('read_at', null),
      sb
        .from('dp_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('kind', 'resource_report_created')
        .is('read_at', null),
      sb
        .from('dp_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .in('kind', categoryKinds.user_tickets)
        .is('read_at', null),
      sb
        .from('dp_resource_user_settings')
        .select('support_notifications')
        .eq('id', user.id)
        .maybeSingle<{ support_notifications: boolean }>(),
    ]);

  const error =
    feed.error ||
    unread.error ||
    adminTickets.error ||
    adminReports.error ||
    userTickets.error ||
    settings.error;
  if (error) return noStore({ error: error.message }, { status: 500 });

  const supportNotifications = settings.data?.support_notifications !== false;
  const notifications = supportNotifications
    ? feed.data || []
    : (feed.data || []).filter(
        (notification) => !userTicketKinds.has(notification.kind),
      );
  const hiddenUnread = supportNotifications ? 0 : userTickets.count || 0;

  return noStore({
    notifications,
    summary: {
      unread: Math.max(0, (unread.count || 0) - hiddenUnread),
      adminTickets: adminTickets.count || 0,
      adminReports: adminReports.count || 0,
      userTickets: supportNotifications ? userTickets.count || 0 : 0,
    },
  });
}

export async function PATCH(request: Request) {
  const forbidden = sameOriginOrForbidden(request);
  if (forbidden) return forbidden;

  const { user } = await requireMember();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object')
    return noStore({ error: 'Expected JSON request body' }, { status: 400 });

  const id = typeof body.id === 'string' ? body.id : null;
  const category =
    typeof body.category === 'string' && body.category in categoryKinds
      ? (body.category as keyof typeof categoryKinds)
      : null;
  const markAll = body.all === true;

  if (!markAll && !category && (!id || !UUID_PATTERN.test(id)))
    return noStore(
      { error: 'Choose a notification or notification category.' },
      { status: 400 },
    );

  const sb = createSupabaseAdminClient();
  let query = sb
    .from('dp_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null);

  if (id) query = query.eq('id', id);
  else if (category) query = query.in('kind', categoryKinds[category]);

  const { error } = await query;
  if (error) return noStore({ error: error.message }, { status: 500 });
  return noStore({ ok: true });
}

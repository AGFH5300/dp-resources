import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('persistent support and report notifications', () => {
  const migration = read(
    'supabase/migrations/20260721220000_ticket_notifications.sql',
  );
  const route = read('app/api/notifications/route.ts');
  const center = read('components/notification-center.tsx');
  const header = read('components/app-header.tsx');
  const admin = read('app/admin/admin-console.tsx');
  const support = read('app/support/support-form.tsx');

  it('stores per-recipient notifications with ownership RLS and restricted writes', () => {
    expect(migration).toContain('create table if not exists public.dp_notifications');
    expect(migration).toContain('alter table public.dp_notifications enable row level security');
    expect(migration).toContain('(select auth.uid()) = recipient_id');
    expect(migration).toContain('grant update (read_at)');
    expect(migration).toContain('revoke all on table public.dp_notifications');
  });

  it('creates admin alerts for new cases and user alerts for replies and status changes', () => {
    expect(migration).toContain('dp_notify_admins_of_support_ticket');
    expect(migration).toContain('dp_notify_admins_of_resource_report');
    expect(migration).toContain('dp_notify_ticket_reply');
    expect(migration).toContain('dp_notify_ticket_status_change');
    expect(migration).toContain("new.visibility <> 'user'");
    expect(migration).toContain("membership.role = 'admin'");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('revoke all on function private.');
  });

  it('keeps notification reads authenticated, owner-scoped, no-store, and same-origin', () => {
    expect(route).toContain('requireMember');
    expect(route).toContain(".eq('recipient_id', user.id)");
    expect(route).toContain('sameOriginOrForbidden');
    expect(route).toContain("'Cache-Control', 'private, no-store, max-age=0'");
    expect(route).toContain('UUID_PATTERN');
  });

  it('shows Apple-style numbered badges in the bell, Support, Admin, and admin tabs', () => {
    expect(center).toContain('NotificationBadge');
    expect(center).toContain('bg-red-600');
    expect(center).toContain("count > 99 ? '99+' : count");
    expect(header).toContain('notificationFeed.summary.userTickets');
    expect(header).toContain('adminUnread');
    expect(admin).toContain('notificationFeed.summary.adminReports');
    expect(admin).toContain('notificationFeed.summary.adminTickets');
  });

  it('marks the relevant feed seen when users or admins open its destination', () => {
    expect(support).toContain("markNotificationCategory('user_tickets')");
    expect(admin).toContain("markNotificationCategory('admin_reports')");
    expect(admin).toContain("markNotificationCategory('admin_tickets')");
  });
});

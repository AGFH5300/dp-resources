import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(p, 'utf8');

describe('support workflow and admin search pass', () => {
  it('support submission has a single request state, checks response.ok before success, and preserves failed content', () => {
    const form = read('app/support/support-form.tsx');
    expect(form).toContain(
      "type RequestState='idle'|'submitting'|'success'|'error'",
    );
    expect(form.indexOf('if(!res.ok||!json?.ticket)')).toBeLessThan(
      form.indexOf("setRequestState('success')"),
    );
    expect(form).toContain("toast.success('Support request sent')");
    expect(form).toContain("toast.error('Could not submit support request')");
    expect(form).toContain('setTickets(prev=>[ticket,...prev])');
    expect(form).toContain('value={message}');
    expect(form).toContain('value={subject}');
  });
  it('user ticket detail route restricts owners and hides internal messages', () => {
    const route = read('app/api/support/[id]/route.ts');
    expect(route).toContain("q.eq('reporter_id', user.id)");
    expect(route).toContain("eq('visibility', 'user')");
    expect(route).not.toContain('internal_notes');
  });
  it('admin replies are persisted as real support ticket messages', () => {
    const route = read('app/api/admin/support/[id]/messages/route.ts');
    expect(route).toContain('requireAdmin');
    expect(route).toContain('dp_support_ticket_messages');
    expect(route).toContain("visibility === 'user'");
    expect(route).toContain("update.status = 'in_review'");
  });
  it('email search endpoint is admin-only and the shared input is used in all admin sections', () => {
    expect(read('app/api/admin/users/search/route.ts')).toContain(
      'requireAdmin',
    );
    const admin = read('app/admin/admin-console.tsx');
    expect(
      (admin.match(/EmailSearchInput/g) || []).length,
    ).toBeGreaterThanOrEqual(4);
    expect(admin).not.toContain('Filter</button>');
    expect(admin).toContain('router.replace');
    expect(admin).toContain("q.set(k, '1')");
  });

  it('support ticket inspector keeps internal notes but removes resolution note from support saves', () => {
    const admin = read('app/admin/admin-console.tsx');
    const supportRoute = read('app/api/admin/support/[id]/route.ts');
    expect(admin).toContain('Internal notes');
    expect(admin).toContain('User-visible reply');
    expect(admin).toContain(
      '{isReport && <label className="text-xs font-semibold text-slate-600">Resolution note',
    );
    expect(admin).toContain('...(isReport ? { resolution_note:');
    expect(supportRoute).toContain("'internal_notes'");
    expect(supportRoute).not.toContain("'resolution_note'");
    expect(supportRoute).not.toContain('update.resolution_note');
  });
  it('migration creates message table, policies, and email/activity indexes', () => {
    const m = read(
      'supabase/migrations/20260706120000_support_messages_and_admin_search.sql',
    );
    expect(m).toContain(
      'create table if not exists public.dp_support_ticket_messages',
    );
    expect(m).toContain("visibility in ('user','internal')");
    expect(m).toContain('dp_memberships_lower_email_idx');
    expect(m).toContain('dp_activity_user_created_idx');
  });
});

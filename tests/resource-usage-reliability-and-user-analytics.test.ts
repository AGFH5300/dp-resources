import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('reliable resource usage tracking', () => {
  it('sends frequent heartbeats, final intervals, and resumes after page restoration', () => {
    const tracker = read('app/resource/[fileId]/usage-tracker.tsx');

    expect(tracker).toContain('deltaSeconds');
    expect(tracker).toContain('wasActive');
    expect(tracker).toContain(
      'window.setInterval(() => void heartbeat(), 10_000)',
    );
    expect(tracker).toContain("document.addEventListener('visibilitychange'");
    expect(tracker).toContain(
      "window.addEventListener('pagehide', onPageHide)",
    );
    expect(tracker).toContain(
      "window.addEventListener('pageshow', onPageShow)",
    );
    expect(tracker).toContain('event.persisted');
    expect(tracker).toContain('sendBeacon(false');
    expect(tracker).toContain('sendBeacon(true');
    expect(tracker).not.toContain('18_000');
  });

  it('uses one atomic database update instead of a read-then-write total', () => {
    const route = read('app/api/resource-usage/[sessionId]/route.ts');

    expect(route).toContain("sb.rpc('dp_resource_usage_heartbeat_admin_safe'");
    expect(route).toContain('p_user_id: userId');
    expect(route).toContain('p_delta_seconds: boundedDelta');
    expect(route).not.toContain(".select('last_heartbeat_at");
    expect(route).not.toContain('active_seconds: Number(');
    expect(route).toContain('body?.end === false');
  });

  it('locks each session and grants the internal heartbeat only to service_role', () => {
    const migration = read(
      'supabase/migrations/20260721073837_fix_resource_usage_tracking.sql',
    );

    expect(migration).toContain('for update');
    expect(migration).toContain('security invoker');
    expect(migration).toContain('v_elapsed_seconds <= 300');
    expect(migration).toContain('v_requested_seconds,');
    expect(migration).toContain('v_elapsed_seconds,');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
    expect(migration).not.toContain('v_elapsed_seconds >= 10');
  });
});

describe('admin per-user resource analytics', () => {
  it('loads usernames and all-time usage for a selected user', () => {
    const page = read('app/admin/page.tsx');

    expect(page).toContain(".select('id,username,full_name')");
    expect(page).toContain('profileUsernames');
    expect(page).toContain('usageSelectedUser');
    expect(page).toContain("p_range: sp.userUsageRange || 'all'");
    expect(page).toContain("'dp_admin_resource_usage_for_user'");
  });

  it('shows a username column and clickable user analytics modal', () => {
    const console = read('app/admin/admin-console.tsx');

    expect(console).toContain('<th className="p-2">Username</th>');
    expect(console).toContain('userUsageId: u.id');
    expect(console).toContain('function UserUsageModal');
    expect(console).toContain('Resource analytics for');
    expect(console).toContain('Files viewed');
    expect(console).toContain('Total active time');
    expect(console).toContain('Last viewed');
    expect(console).toContain("['all', 'All time']");
    expect(console).toContain('No resource views recorded for this user');
    expect(console).toContain('label="Close user resource analytics"');
  });
});

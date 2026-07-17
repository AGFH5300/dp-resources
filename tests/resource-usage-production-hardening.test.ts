import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('resource usage production hardening', () => {
  it('starts tracking only after member auth and Drive-root validation', () => {
    const route = read('app/api/resource-usage/route.ts');
    expect(route.indexOf('await requireMember()')).toBeLessThan(
      route.indexOf('await assertInsideRoot(fileId)'),
    );
    expect(route).toContain('DRIVE_ID_RE.test(fileId)');
    expect(route).toContain(
      "Response.json({ error: 'Resource not found.' }, { status: 404 })",
    );
    expect(route.indexOf('await assertInsideRoot(fileId)')).toBeLessThan(
      route.indexOf('dp_resource_usage_start'),
    );
  });

  it('uses the authenticated cookie client for admin analytics RPCs', () => {
    const page = read('app/admin/page.tsx');
    expect(page).toContain(
      "import { createClient } from '@/lib/supabase-server';",
    );
    expect(page).toContain('const userSb=await createClient()');
    expect(page).toContain("userSb.rpc('dp_admin_resource_usage_leaderboard'");
    expect(page).toContain("userSb.rpc('dp_admin_resource_usage_for_resource'");
    expect(page).toContain("userSb.rpc('dp_admin_resource_usage_for_user'");
    expect(page).not.toContain("sb.rpc('dp_admin_resource_usage_leaderboard'");
  });

  it('adds corrective SQL for authorization, one active resource session, concurrency, heartbeats, and cleanup', () => {
    const sql = read(
      'supabase/migrations/20260708100000_resource_usage_production_hardening.sql',
    );
    expect(sql).toContain('dp_usage_sessions_one_active_user_file_idx');
    expect(sql).toContain('where ended_at is null');
    expect(sql).toContain('return v_id;');
    expect(sql).toContain("last_heartbeat_at < now() - interval '5 minutes'");
    expect(sql).toContain('if v_active_count >= 2 then');
    expect(sql).toContain('v_elapsed >= 10');
    expect(sql).toContain('least(60, v_elapsed)');
    expect(sql).toContain('dp_resource_usage_cleanup_stale');
    expect(sql).toContain('dp_admin_assert_resource_usage_admin');
    expect(sql).toContain("errcode = '42501'");
  });

  it('adds service-role-only housekeeping retention helpers', () => {
    const sql = read(
      'supabase/migrations/20260708101000_platform_housekeeping.sql',
    );
    expect(sql).toContain('dp_run_platform_housekeeping');
    expect(sql).toContain("window_start < now() - interval '7 days'");
    expect(sql).toContain("occurred_at < now() - interval '90 days'");
    expect(sql).toContain(
      "ended_at is not null and ended_at < now() - interval '12 months'",
    );
    expect(sql).toContain(
      "current_setting('role', true), '') <> 'service_role'",
    );
    expect(sql).toContain(
      'revoke execute on function public.dp_run_platform_housekeeping() from public, anon, authenticated',
    );
    expect(sql).toContain('cron.schedule');
  });

  it('renders admin analytics leaderboard with a compact View stats modal', () => {
    const console = read('app/admin/admin-console.tsx');
    expect(console).toContain('Usage analytics');
    expect(console).toContain("['today','7d','30d','all']");
    expect(console).toContain('View stats');
    expect(console).toContain('ResourceUsageModal');
    expect(console).toContain('role="dialog"');
    expect(console).toContain('aria-labelledby="resource-usage-modal-title"');
    expect(console).toContain('Resource usage leaderboard');
    expect(console).toContain('{usageResource.resource_name}');
    expect(console).toContain('Open preview');
    expect(console).toContain('target="_blank"');
    expect(console).toContain('rel="noreferrer"');
    expect(console).toContain('Per-resource user breakdown');
    expect(console).toContain('usageUsers.map');
    expect(console).toContain('View user usage');
    expect(console).toContain('Top resources used by');
    expect(console).toContain('usageUserResources.map');
    expect(console).toContain('Clear user');
    expect(console).toContain('No usage data yet. Open a resource as');
    expect(console).toContain('one heartbeat interval.');
    expect(console).toContain('No user breakdown available for this range.');
    expect(console).toContain(
      'No usage data available for this user in this range.',
    );
    expect(console).toContain('max-h-[90vh]');
    expect(console).toContain('max-h-[calc(90vh-8rem)] overflow-y-auto');
    expect(console).toContain('sticky top-0');
    expect(console).toContain('overflow-x-auto');
    expect(console).toContain('Escape');
    expect(console).toContain('router.replace');
    expect(console).toContain('formatMimeType(r.mime_type, r.resource_name)');
    expect(console).not.toContain('Resource analytics detail');
    expect(console).not.toContain('Per-user top resources');
    expect(console).not.toContain('<td className="p-2">{r.mime_type}</td>');
    expect(console).not.toContain('{usageResource.mime_type}');
  });
});

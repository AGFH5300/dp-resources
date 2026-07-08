import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('resource usage production hardening', () => {
  it('starts tracking only after member auth and Drive-root validation', () => {
    const route = read('app/api/resource-usage/route.ts')
    expect(route.indexOf('await requireMember()')).toBeLessThan(route.indexOf('await assertInsideRoot(fileId)'))
    expect(route).toContain('DRIVE_ID_RE.test(fileId)')
    expect(route).toContain("Response.json({ error: 'Resource not found.' }, { status: 404 })")
    expect(route.indexOf('await assertInsideRoot(fileId)')).toBeLessThan(route.indexOf("dp_resource_usage_start"))
  })

  it('uses the authenticated cookie client for admin analytics RPCs', () => {
    const page = read('app/admin/page.tsx')
    expect(page).toContain("import { createClient } from '@/lib/supabase-server';")
    expect(page).toContain('const userSb=await createClient()')
    expect(page).toContain("userSb.rpc('dp_admin_resource_usage_leaderboard'")
    expect(page).toContain("userSb.rpc('dp_admin_resource_usage_for_resource'")
    expect(page).toContain("userSb.rpc('dp_admin_resource_usage_for_user'")
    expect(page).not.toContain("sb.rpc('dp_admin_resource_usage_leaderboard'")
  })

  it('adds corrective SQL for authorization, one active resource session, concurrency, heartbeats, and cleanup', () => {
    const sql = read('supabase/migrations/20260708100000_resource_usage_production_hardening.sql')
    expect(sql).toContain('dp_usage_sessions_one_active_user_file_idx')
    expect(sql).toContain('where ended_at is null')
    expect(sql).toContain('return v_id;')
    expect(sql).toContain("last_heartbeat_at < now() - interval '5 minutes'")
    expect(sql).toContain('if v_active_count >= 2 then')
    expect(sql).toContain('v_elapsed >= 10')
    expect(sql).toContain('least(60, v_elapsed)')
    expect(sql).toContain('dp_resource_usage_cleanup_stale')
    expect(sql).toContain('dp_admin_assert_resource_usage_admin')
    expect(sql).toContain("errcode = '42501'")
  })

  it('adds service-role-only housekeeping retention helpers', () => {
    const sql = read('supabase/migrations/20260708101000_platform_housekeeping.sql')
    expect(sql).toContain('dp_run_platform_housekeeping')
    expect(sql).toContain("window_start < now() - interval '7 days'")
    expect(sql).toContain("occurred_at < now() - interval '90 days'")
    expect(sql).toContain("ended_at is not null and ended_at < now() - interval '12 months'")
    expect(sql).toContain("current_setting('role', true), '') <> 'service_role'")
    expect(sql).toContain('revoke execute on function public.dp_run_platform_housekeeping() from public, anon, authenticated')
    expect(sql).toContain('cron.schedule')
  })

  it('renders admin analytics leaderboard and detail drill-downs only in Admin', () => {
    const console = read('app/admin/admin-console.tsx')
    expect(console).toContain('Usage analytics')
    expect(console).toContain("['today','7d','30d','all']")
    expect(console).toContain('Resource analytics detail')
    expect(console).toContain('Per-resource user breakdown')
    expect(console).toContain('Per-user top resources')
    expect(console).toContain('Current rank')
    expect(console).toContain('Total active time')
    expect(console).toContain('Unique users')
    expect(console).toContain('Last used')
  })
})

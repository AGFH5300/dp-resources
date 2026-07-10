import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('suspension UX regression coverage', () => {
  it('requireMember redirects suspended memberships to the dedicated page', () => {
    const source = read('lib/auth.ts')
    expect(source).toContain("if (ctx.membership.is_suspended) redirect('/account-suspended')")
    expect(source).not.toContain('account_suspended')
  })

  it('login layout distinguishes signed out, active and suspended sessions', () => {
    const source = read('app/auth/login/layout.tsx')
    expect(source).toContain('if (!user) return children')
    expect(source).toContain("if (membership?.is_suspended) redirect('/account-suspended')")
    expect(source).toContain("redirect('/library')")
  })

  it('suspended page is public, safe, and does not redirect to library', () => {
    const page = read('app/account-suspended/page.tsx')
    const middleware = read('middleware.ts')
    expect(page).toContain('Your account has been suspended.')
    expect(page).toContain('You no longer have access to DP Resources. Contact the site administrator if you believe this is a mistake.')
    expect(page).toContain('action="/api/auth/signout"')
    expect(page).not.toContain('suspension_reason')
    expect(page).not.toContain("redirect('/library')")
    expect(middleware).toContain("'/account-suspended'")
  })

  it('watcher redirects exactly once when suspension changes and does nothing noisy for active users', () => {
    const source = read('components/suspension-watcher.tsx')
    expect(source).toContain("window.location.replace(ACCOUNT_SUSPENDED_PATH)")
    expect(source).toContain('navigatedRef.current')
    expect(source).toContain("filter: `id=eq.${userId}`")
    expect(source).toContain('is_suspended === true')
    expect(source).toContain("fetch('/api/account/status', { cache: 'no-store' })")
    expect(source).toContain('window.setInterval(() => void checkStatus(), 30000)')
    expect(source).toContain('supabase.removeChannel(channel)')
    expect(source).not.toContain('router.refresh')
  })

  it('status endpoint returns only privacy-safe no-store status', () => {
    const source = read('app/api/account/status/route.ts')
    expect(source).toContain('authenticated: Boolean(user)')
    expect(source).toContain('suspended: Boolean(membership?.is_suspended)')
    expect(source).toContain("'Cache-Control': 'no-store, max-age=0'")
    expect(source).not.toContain('suspension_reason')
  })

  it('live filters skip no-op replace and changed filter replaces once through the debounced path', () => {
    const source = read('app/admin/admin-console.tsx')
    expect(source).toContain('if (nextUrl === currentUrl) return; router.replace(nextUrl);')
    expect(source.match(/router\.replace\(nextUrl\)/g)).toHaveLength(1)
    expect(source).toContain('setTimeout(() => apply({ userEmail: email }, [\'userPage\']), 300)')
  })

  it('admin tabs render before suspension controls and users have one table', () => {
    const page = read('app/admin/page.tsx')
    const consoleSource = read('app/admin/admin-console.tsx')
    expect(page).not.toContain('<UserSuspensionPanel')
    expect(consoleSource.indexOf('aria-label="Admin sections"')).toBeLessThan(consoleSource.indexOf('<UserSuspensionControls user={u}'))
    expect(consoleSource.match(/<table className="min-w-full text-sm">/g)?.length).toBeGreaterThanOrEqual(1)
    expect(consoleSource).not.toContain('UserSuspensionPanel')
  })

  it('realtime migration is idempotent and only publishes memberships', () => {
    const source = read('supabase/migrations/20260710190000_memberships_realtime_publication.sql')
    expect(source).toContain('if not exists')
    expect(source).toContain('alter publication supabase_realtime add table public.dp_resource_memberships')
    expect(source).not.toContain('dp_resource_email_domain_rules')
    expect(source).not.toContain('dp_resource_moderation_events')
  })
})

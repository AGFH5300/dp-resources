import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { getEmailDomainPolicy, DISPOSABLE_EMAIL_MESSAGE } from '../lib/disposable-email'

const authSource = readFileSync('lib/auth.ts', 'utf8')
const signupSource = readFileSync('app/api/auth/start-signup/route.ts', 'utf8')
const availabilitySource = readFileSync('app/api/auth/availability/route.ts', 'utf8')
const suspensionRouteSource = readFileSync('app/api/admin/users/[id]/suspension/route.ts', 'utf8')
const panelSource = readFileSync('app/admin/user-suspension-panel.tsx', 'utf8')
const loginSource = readFileSync('app/auth/login/page.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20260710153000_disposable_email_and_user_suspension.sql', 'utf8')

describe('central suspension enforcement', () => {
  it('checks suspension in requireMember and preserves requireApproved as compatibility access', () => {
    expect(authSource).toContain('ctx.membership.is_suspended')
    expect(authSource).toContain("/auth/login?error=account_suspended")
    expect(authSource).toContain('export async function requireApproved()')
    expect(authSource).toContain('return requireMember()')
    expect(authSource).toContain('const ctx = await requireMember()')
  })

  it('shows the suspended-account message and performs local browser sign-out only', () => {
    expect(loginSource).toContain('account_suspended')
    expect(loginSource).toContain('This account has been suspended. Contact the site administrator if you believe this is a mistake.')
    expect(loginSource).toContain("signOut({ scope: 'local' })")
    expect(loginSource).toContain('safeInternalReturnPath')
  })
})

describe('disposable domain policy', () => {
  it('defensively allows only explicit allowed=true policy responses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: false, domain: 'epaynine.com', reason: 'blocked' }, error: null })
    await expect(getEmailDomainPolicy({ rpc } as never, 'User@epaynine.com')).resolves.toEqual({ allowed: false, domain: 'epaynine.com', reason: 'blocked' })
    expect(rpc).toHaveBeenCalledWith('dp_resource_email_domain_policy', { p_email: 'user@epaynine.com' })
  })

  it('throws when the authoritative RPC fails so callers can fail closed', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } })
    await expect(getEmailDomainPolicy({ rpc } as never, 'student@example.edu')).rejects.toThrow('Unable to validate email domain policy')
  })

  it('checks domain policy before email availability and before OTP creation', () => {
    expect(availabilitySource.indexOf('getEmailDomainPolicy')).toBeLessThan(availabilitySource.indexOf('dp_resource_is_email_available'))
    expect(signupSource.indexOf('getEmailDomainPolicy')).toBeLessThan(signupSource.indexOf('dp_resource_username_availability_status'))
    expect(signupSource.indexOf('getEmailDomainPolicy')).toBeLessThan(signupSource.indexOf('signInWithOtp'))
    expect(DISPOSABLE_EMAIL_MESSAGE).toBe('Temporary or disposable email addresses cannot be used. Please use a permanent email address.')
    expect(signupSource).toContain('DISPOSABLE_EMAIL_MESSAGE')
    expect(availabilitySource).toContain('DISPOSABLE_EMAIL_MESSAGE')
  })
})

describe('administrator suspension route and UI', () => {
  it('uses same-origin and admin checks, bans without deleting users, and records moderation events', () => {
    expect(suspensionRouteSource.indexOf('sameOriginOrForbidden(request)')).toBeLessThan(suspensionRouteSource.indexOf('requireAdmin()'))
    expect(suspensionRouteSource).toContain("ban_duration: '876000h'")
    expect(suspensionRouteSource).toContain("ban_duration: 'none'")
    expect(suspensionRouteSource).toContain('dp_resource_moderation_events')
    expect(suspensionRouteSource).not.toContain('deleteUser')
    expect(suspensionRouteSource).not.toMatch(/\.delete\(/)
  })

  it('prevents self/admin suspension and protects mainstream provider domain blocks', () => {
    expect(suspensionRouteSource).toContain('target.id === actingAdmin.id')
    expect(suspensionRouteSource).toContain("target.role === 'admin'")
    expect(suspensionRouteSource).toContain('PROTECTED_EMAIL_DOMAINS')
    expect(suspensionRouteSource).toContain('Mainstream provider domains cannot be blocked')
  })

  it('renders focused controls without suspend buttons for admins and explains retained history', () => {
    expect(panelSource).toContain("user.role !== 'admin'")
    expect(panelSource).toContain('Unsuspend')
    expect(panelSource).toContain('retaining profile, activity, download and analytics history')
    expect(panelSource).toContain('Mainstream provider domains')
  })
})

describe('migration coverage', () => {
  it('adds suspension and disposable email objects without hard-deleting records', () => {
    expect(migration).toContain('is_suspended')
    expect(migration).toContain('dp_resource_email_domain_rules')
    expect(migration).toContain('dp_resource_email_domain_policy')
    expect(migration).toContain('dp_before_user_created')
    expect(migration).toContain('dp_resource_moderation_events')
    expect(migration).toContain('epaynine.com')
    expect(migration).toContain('set search_path = public, pg_temp')
    expect(migration).not.toMatch(/delete\s+from\s+public\.dp_resource_/i)
  })
})

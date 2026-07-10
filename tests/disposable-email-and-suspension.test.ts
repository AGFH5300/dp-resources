import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getEmailDomainPolicy, DISPOSABLE_EMAIL_MESSAGE } from '../lib/disposable-email'

const userId = '11111111-1111-4111-8111-111111111111'
const adminId = '22222222-2222-4222-8222-222222222222'

function req(url: string, body?: unknown) {
  return new Request(url, { method: body ? 'POST' : 'GET', headers: { origin: 'https://app.test' }, body: body ? JSON.stringify(body) : undefined })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('disposable domain policy', () => {
  it('normalizes email and returns authoritative RPC decisions', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: false, domain: 'epaynine.com', reason: 'blocked' }, error: null })
    await expect(getEmailDomainPolicy({ rpc } as never, ' User@EPAYNINE.com ')).resolves.toEqual({ allowed: false, domain: 'epaynine.com', reason: 'blocked' })
    expect(rpc).toHaveBeenCalledWith('dp_resource_email_domain_policy', { p_email: 'user@epaynine.com' })
  })

  it('throws on RPC failure so routes fail closed', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } })
    await expect(getEmailDomainPolicy({ rpc } as never, 'student@example.edu')).rejects.toThrow('Unable to validate email domain policy')
  })
})

describe('signup route behavior', () => {
  async function loadStartSignup(policy: { allowed: boolean } | Error) {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null })
    const rpc = vi.fn().mockImplementation((name: string) => {
      if (name === 'dp_resource_username_availability_status') return Promise.resolve({ data: 'available', error: null })
      if (name === 'dp_resource_is_email_available') return Promise.resolve({ data: true, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    vi.doMock('../lib/request-security', () => ({ sameOriginOrForbidden: vi.fn(() => null) }))
    vi.doMock('../lib/rate-limit', () => ({ privacySafeRequestKey: vi.fn(() => 'k'), rateLimit: vi.fn(async () => ({ ok: true })) }))
    vi.doMock('../lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ rpc, auth: { signInWithOtp } })) }))
    vi.doMock('../lib/disposable-email', async () => ({ ...(await vi.importActual('../lib/disposable-email') as object), getEmailDomainPolicy: vi.fn(async () => { if (policy instanceof Error) throw policy; return { domain: 'epaynine.com', reason: null, ...policy } }) }))
    return { route: await import('../app/api/auth/start-signup/route'), signInWithOtp }
  }

  it('does not send OTP for blocked email', async () => {
    const { route, signInWithOtp } = await loadStartSignup({ allowed: false })
    const res = await route.POST(req('https://app.test/api/auth/start-signup', { username: 'student1', fullName: 'Student One', email: 'user@epaynine.com' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ ok: false, field: 'email', message: DISPOSABLE_EMAIL_MESSAGE })
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('sends OTP for allowed email', async () => {
    const { route, signInWithOtp } = await loadStartSignup({ allowed: true })
    const res = await route.POST(req('https://app.test/api/auth/start-signup', { username: 'student1', fullName: 'Student One', email: 'user@example.edu' }))
    expect(res.status).toBe(200)
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'user@example.edu' }))
  })

  it('fails closed when domain RPC fails', async () => {
    const { route, signInWithOtp } = await loadStartSignup(new Error('rpc down'))
    const res = await route.POST(req('https://app.test/api/auth/start-signup', { username: 'student1', fullName: 'Student One', email: 'user@example.edu' }))
    expect(res.status).toBe(500)
    expect(signInWithOtp).not.toHaveBeenCalled()
  })
})

describe('availability route behavior', () => {
  it('returns invalid for blocked domains before email availability RPC', async () => {
    const rpc = vi.fn()
    vi.doMock('../lib/rate-limit', () => ({ privacySafeRequestKey: vi.fn(() => 'k'), rateLimit: vi.fn(async () => ({ ok: true })) }))
    vi.doMock('../lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ rpc })) }))
    vi.doMock('../lib/disposable-email', async () => ({ ...(await vi.importActual('../lib/disposable-email') as object), getEmailDomainPolicy: vi.fn(async () => ({ allowed: false, domain: 'epaynine.com', reason: 'blocked' })) }))
    const route = await import('../app/api/auth/availability/route')
    const res = await route.GET(new Request('https://app.test/api/auth/availability?type=email&value=user@epaynine.com'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ status: 'invalid', available: false, message: DISPOSABLE_EMAIL_MESSAGE })
    expect(rpc).not.toHaveBeenCalledWith('dp_resource_is_email_available', expect.anything())
  })
})

describe('suspension API behavior', () => {
  function tableMock(opts: { target?: Record<string, unknown>; auditError?: boolean; unbanError?: boolean; banError?: boolean; domainError?: boolean; policy?: Record<string, unknown> } = {}) {
    const calls: string[] = []
    const update = vi.fn((values: unknown) => ({ eq: vi.fn(async () => { calls.push(`membership:${JSON.stringify(values)}`); return { error: null } }) }))
    const insert = vi.fn(async (values: { action?: string }) => { calls.push(`audit:${values.action}`); return { error: opts.auditError ? { code: 'AUDIT', message: 'audit failed' } : null } })
    const upsert = vi.fn(async (values: unknown) => { calls.push(`domain:${JSON.stringify(values)}`); return { error: opts.domainError ? { code: 'DOMAIN', message: 'domain failed' } : null } })
    const from = vi.fn((name: string) => {
      if (name === 'dp_resource_memberships') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: opts.target ?? { id: userId, email: 'user@epaynine.com', role: 'user' }, error: null })) })) })), update }
      if (name === 'dp_resource_moderation_events') return { insert }
      if (name === 'dp_resource_email_domain_rules') return { upsert }
      throw new Error(name)
    })
    const updateUserById = vi.fn(async (_id: string, payload: { ban_duration: string }) => { calls.push(`auth:${payload.ban_duration}`); return { error: payload.ban_duration === 'none' && opts.unbanError ? { code: 'UNBAN', message: 'no' } : payload.ban_duration !== 'none' && opts.banError ? { code: 'BAN', message: 'no' } : null } })
    const rpc = vi.fn(async () => ({ data: opts.policy ?? { allowed: true, matched_domain: null }, error: null }))
    return { client: { from, rpc, auth: { admin: { updateUserById } } }, calls, updateUserById, upsert, rpc }
  }

  async function loadSuspension(m: ReturnType<typeof tableMock>) {
    vi.doMock('../lib/request-security', () => ({ sameOriginOrForbidden: vi.fn(() => null) }))
    vi.doMock('../lib/auth', () => ({ requireAdmin: vi.fn(async () => ({ user: { id: adminId }, membership: { email: 'admin@example.edu' } })) }))
    vi.doMock('../lib/supabase-admin', () => ({ createSupabaseAdminClient: vi.fn(() => m.client) }))
    return import('../app/api/admin/users/[id]/suspension/route')
  }

  it('updates membership before Auth ban, audits suspend and block_domain, and never deletes users', async () => {
    const m = tableMock()
    const route = await loadSuspension(m)
    const res = await route.PATCH(new Request('https://app.test/api/admin/users/x/suspension', { method: 'PATCH', body: JSON.stringify({ suspended: true, reason: 'Abuse report', blockDomain: true }) }), { params: Promise.resolve({ id: userId }) })
    expect(res.status).toBe(200)
    expect(m.calls[0]).toContain('membership')
    expect(m.calls[1]).toBe('auth:876000h')
    expect(m.calls).toContain('audit:suspend')
    expect(m.calls).toContain('audit:block_domain')
    expect(JSON.stringify(m.client)).not.toContain('delete')
  })

  it('returns audit warning while preserving successful suspension', async () => {
    const m = tableMock({ auditError: true })
    const route = await loadSuspension(m)
    const res = await route.PATCH(new Request('https://app.test/api/admin/users/x/suspension', { method: 'PATCH', body: JSON.stringify({ suspended: true, reason: 'Abuse report' }) }), { params: Promise.resolve({ id: userId }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, suspended: true, warnings: [expect.stringContaining('audit log')] })
  })

  it('unbans before clearing suspension fields and failed unban leaves user suspended', async () => {
    const ok = tableMock()
    let route = await loadSuspension(ok)
    let res = await route.PATCH(new Request('https://app.test/api/admin/users/x/suspension', { method: 'PATCH', body: JSON.stringify({ suspended: false }) }), { params: Promise.resolve({ id: userId }) })
    expect(res.status).toBe(200)
    expect(ok.calls[0]).toBe('auth:none')
    expect(ok.calls[1]).toContain('membership')

    vi.resetModules()
    const fail = tableMock({ unbanError: true })
    route = await loadSuspension(fail)
    res = await route.PATCH(new Request('https://app.test/api/admin/users/x/suspension', { method: 'PATCH', body: JSON.stringify({ suspended: false }) }), { params: Promise.resolve({ id: userId }) })
    expect(res.status).toBe(500)
    expect(fail.calls).toEqual(['auth:none'])
  })

  it('rejects suspending admins or the current admin', async () => {
    for (const target of [{ id: adminId, email: 'me@example.edu', role: 'user' }, { id: userId, email: 'admin@example.edu', role: 'admin' }]) {
      vi.resetModules()
      const route = await loadSuspension(tableMock({ target }))
      const res = await route.PATCH(new Request('https://app.test/api/admin/users/x/suspension', { method: 'PATCH', body: JSON.stringify({ suspended: true, reason: 'Abuse report' }) }), { params: Promise.resolve({ id: target.id as string }) })
      expect(res.status).toBe(403)
    }
  })


  it('does not overwrite an exact explicit allow rule but still suspends the user', async () => {
    const m = tableMock({ target: { id: userId, email: 'student@diaestudents.com', role: 'user' }, policy: { allowed: true, matched_domain: 'diaestudents.com' } })
    const route = await loadSuspension(m)
    const res = await route.PATCH(new Request('https://app.test/api/admin/users/x/suspension', { method: 'PATCH', body: JSON.stringify({ suspended: true, reason: 'Abuse report', blockDomain: true }) }), { params: Promise.resolve({ id: userId }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, suspended: true, warnings: [expect.stringContaining('explicit allow rule')] })
    expect(m.calls.some(call => call.startsWith('membership:'))).toBe(true)
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('protects a subdomain when a parent-domain allow rule is most-specific', async () => {
    const m = tableMock({ target: { id: userId, email: 'student@mail.school.edu', role: 'user' }, policy: { allowed: true, matched_domain: 'school.edu' } })
    const route = await loadSuspension(m)
    const res = await route.PATCH(new Request('https://app.test/api/admin/users/x/suspension', { method: 'PATCH', body: JSON.stringify({ suspended: true, reason: 'Abuse report', blockDomain: true }) }), { params: Promise.resolve({ id: userId }) })
    expect(res.status).toBe(200)
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('does not resubmit an already-blocked domain', async () => {
    const m = tableMock({ target: { id: userId, email: 'bad@throwaway.test', role: 'user' }, policy: { allowed: false, matched_domain: 'throwaway.test' } })
    const route = await loadSuspension(m)
    const res = await route.PATCH(new Request('https://app.test/api/admin/users/x/suspension', { method: 'PATCH', body: JSON.stringify({ suspended: true, reason: 'Abuse report', blockDomain: true }) }), { params: Promise.resolve({ id: userId }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ warnings: [expect.stringContaining('already blocked')] })
    expect(m.upsert).not.toHaveBeenCalled()
  })
})

describe('migration coverage', () => {
  const migration = readFileSync('supabase/migrations/20260710153000_disposable_email_and_user_suspension.sql', 'utf8')
  it('uses the existing membership trigger function and atomic corrected hook permissions', () => {
    expect(migration).toMatch(/^-- Disposable email blocking and application-level user suspension\.\n\nbegin;/)
    expect(migration.trim().endsWith('commit;')).toBe(true)
    expect(migration).toContain('create or replace function public.dp_resources_handle_new_user()')
    expect(migration).not.toContain('dp_resource_create_membership_for_new_user')
    expect(migration).not.toMatch(/create\s+trigger/i)
    expect(migration).toContain("return '{}'::jsonb")
    expect(migration).toMatch(/create or replace function public\.dp_before_user_created[\s\S]*?language plpgsql\nset search_path = ''/)
    expect(migration).toContain('grant execute on function public.dp_before_user_created(jsonb) to supabase_auth_admin')
  })

  it('has constraints and most-specific parent-domain policy matching', () => {
    expect(migration).toContain('dp_resource_memberships_suspension_reason_length')
    expect(migration).toContain('dp_resource_email_domain_rules_domain_normalized')
    expect(migration).toContain('dp_resource_moderation_events_action_valid')
    expect(migration).toContain("v_domain like '%." )
    expect(migration).toContain('order by char_length(public.dp_resource_email_domain_rules.domain) desc')
    expect(migration).not.toMatch(/delete\s+from\s+public\.dp_resource_/i)
  })

  it('returns only a generic reason from the public domain policy for blocked rules', () => {
    const policyFunction = migration.match(/create or replace function public\.dp_resource_email_domain_policy[\s\S]*?\n\$\$;/)?.[0] ?? ''

    expect(policyFunction).toContain("'reason', 'blocked_domain'")
    expect(policyFunction).not.toContain('coalesce(v_rule.reason')
    expect(policyFunction).not.toMatch(/'reason',\s*v_rule\.reason/i)
    expect(policyFunction).not.toContain('Internal abuse investigation details')
  })

  it('uses a strict hostname constraint for domain rules', () => {
    const allowed = ['epaynine.com', 'mail.example.edu', 'school.ac.in', 'temporary-mail.example.com']
    const rejected = ['com', '%.com', '.example.com', 'example.com.', 'example_.com', 'example..com', '-example.com', 'example-.com']
    const domainConstraint = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

    expect(migration).toContain('domain = lower(btrim(domain))')
    expect(migration).toContain("'^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'")
    for (const domain of allowed) expect(domain).toMatch(domainConstraint)
    for (const domain of rejected) expect(domain).not.toMatch(domainConstraint)
  })

  it('explicitly validates membership suspension constraints after adding them as not valid', () => {
    for (const constraint of [
      'dp_resource_memberships_suspension_reason_length',
      'dp_resource_memberships_suspended_metadata_required',
      'dp_resource_memberships_unsuspended_metadata_cleared',
    ]) {
      expect(migration).toMatch(new RegExp(`add constraint ${constraint}[\\s\\S]*?not valid`, 'i'))
      expect(migration).toContain(`validate constraint ${constraint};`)
    }
  })
})

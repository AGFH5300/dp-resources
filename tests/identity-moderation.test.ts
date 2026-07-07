import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { validateEmailLocalPartIdentity, validateFullNameIdentity, validateUsernameIdentity } from '../lib/identity-moderation'

describe('identity moderation policy', () => {
  it('rejects direct offensive username plus separator and leetspeak obfuscation', () => {
    expect(validateUsernameIdentity('nazi').ok).toBe(false)
    expect(validateUsernameIdentity('n_4_z_i').ok).toBe(false)
    expect(validateUsernameIdentity('f4gg0t').ok).toBe(false)
  })
  it('rejects inappropriate full name and email local-part only', () => {
    expect(validateFullNameIdentity('Nazi Person').ok).toBe(false)
    expect(validateEmailLocalPartIdentity('n.a.z.i@example.edu').ok).toBe(false)
    expect(validateEmailLocalPartIdentity('student@sexeducation.edu').ok).toBe(true)
  })
  it('allows benign similar sequences and reserves platform-style usernames', () => {
    expect(validateFullNameIdentity('Dickinson Smith').ok).toBe(true)
    expect(validateUsernameIdentity('admin').ok).toBe(false)
    expect(validateUsernameIdentity('dp_resources_official').ok).toBe(false)
  })
  it('keeps policy server-only and generic', () => {
    const source = readFileSync('lib/identity-moderation.ts', 'utf8')
    expect(source).toContain("import 'server-only'")
    expect(source).toContain('identity_not_allowed')
  })
})

describe('signup enforcement wiring', () => {
  const signup = readFileSync('app/api/auth/start-signup/route.ts', 'utf8')
  const availability = readFileSync('app/api/auth/availability/route.ts', 'utf8')
  const schema = readFileSync('supabase/migrations/20260707000000_identity_moderation.sql', 'utf8')
  it('blocks before OTP is sent and availability is neutral', () => {
    expect(signup.indexOf('validateUsernameIdentity')).toBeLessThan(signup.indexOf('signInWithOtp'))
    expect(signup).toContain('validateFullNameIdentity')
    expect(signup).toContain('validateEmailLocalPartIdentity')
    expect(availability).toContain('That username cannot be used.')
  })
  it('adds rate limiting without raw identity keys', () => {
    expect(signup).toContain('privacySafeRequestKey')
    expect(availability).toContain('rateLimit')
    expect(readFileSync('lib/rate-limit.ts', 'utf8')).toContain('createHash')
  })
  it('enforces direct Auth metadata and profile bypasses in the database', () => {
    expect(schema).toContain('dp_identity_auth_users_enforce')
    expect(schema).toContain("new.raw_user_meta_data->>'username'")
    expect(schema).toContain("new.raw_user_meta_data->>'full_name'")
    expect(schema).toContain('dp_identity_local_part(new.email)')
    expect(schema).toContain('dp_identity_profiles_enforce')
    expect(schema).toContain('dp_identity_audit_existing')
  })
  it('uses generic database exceptions and does not expose rules in responses', () => {
    expect(schema).toContain("raise exception 'identity_not_allowed'")
    expect(signup).toContain('Choose a different username.')
    expect(signup).toContain('Enter an appropriate name.')
    expect(signup).toContain('Use a different email address.')
  })
})

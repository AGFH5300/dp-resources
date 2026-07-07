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
  const currentSchema = readFileSync('supabase/schema.sql', 'utf8')
  const usernameRepairMigration = readFileSync(
    'supabase/migrations/20260707203000_fix_username_literal_double_underscore.sql',
    'utf8',
  )
  it('blocks before OTP is sent and availability is neutral', () => {
    expect(signup.indexOf('validateUsernameIdentity')).toBeLessThan(signup.indexOf('signInWithOtp'))
    expect(signup).toContain('validateFullNameIdentity')
    expect(signup).toContain('validateEmailLocalPartIdentity')
    expect(availability).toContain('Choose a different username.')
  })

  it('distinguishes moderated usernames from genuine duplicates without leaking policy details', () => {
    const firstUsernameRpc = availability.indexOf('dp_resource_is_username_available')
    const identityCheck = availability.indexOf('validateUsernameIdentity(value)')
    expect(identityCheck).toBeGreaterThanOrEqual(0)
    expect(identityCheck).toBeLessThan(firstUsernameRpc)
    expect(availability).toContain("return jsonResponse('invalid', false, 'Choose a different username.'")
    expect(availability).toContain("available ? 'Username is available.' : 'That username is already taken.'")
    expect(availability).not.toContain('That username cannot be used.')
    expect(availability).not.toContain('usernamePolicy.reason }')
    expect(signup).toContain("message: 'Choose a different username.'")
    expect(signup).toContain("message: 'That username is already taken.'")
    expect(signup).not.toContain('debug: { reason: usernamePolicy.reason }')
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

  it('repairs database username validation for literal repeated underscores only', () => {
    expect(currentSchema).toContain('create or replace function public.dp_identity_validate_username')
    expect(usernameRepairMigration).toContain('create or replace function public.dp_identity_validate_username')
    expect(currentSchema).toContain("position('__' in p_username) > 0")
    expect(usernameRepairMigration).toContain("position('__' in p_username) > 0")
    expect(currentSchema).not.toContain("like '%__%'")
    expect(usernameRepairMigration).not.toContain("like '%__%'")

    expect(validateUsernameIdentity('normaluser').ok).toBe(true)
    expect(validateUsernameIdentity('student_2026').ok).toBe(true)
    expect(validateUsernameIdentity('a__b').ok).toBe(false)
    expect(validateUsernameIdentity('_student').ok).toBe(false)
    expect(validateUsernameIdentity('student_').ok).toBe(false)
  })
})

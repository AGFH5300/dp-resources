import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isValidEmail } from '../lib/auth-email'
import { safeInternalReturnPath } from '../lib/auth-redirect'

const rootPage = readFileSync('app/page.tsx', 'utf8')
const authPage = readFileSync('app/auth/page.tsx', 'utf8')
const signupRoute = readFileSync('app/api/auth/start-signup/route.ts', 'utf8')
const availabilityRoute = readFileSync('app/api/auth/availability/route.ts', 'utf8')
const verifyOtpForm = readFileSync('app/auth/verify-otp/verify-otp-form.tsx', 'utf8')
const schema = readFileSync('supabase/schema.sql', 'utf8')

describe('auth redirects', () => {
  it('redirects root and legacy auth entry points to the new routes', () => {
    expect(rootPage).toContain("redirect('/auth/login')")
    expect(authPage).toContain("params.mode === 'signup' ? '/auth/sign-up' : '/auth/login'")
  })
})

describe('safe next-path handling', () => {
  it('accepts only safe internal return paths', () => {
    expect(safeInternalReturnPath('/library?folder=abc#top', '/library')).toBe('/library?folder=abc#top')
    expect(safeInternalReturnPath('https://evil.example', '/library')).toBe('/library')
    expect(safeInternalReturnPath('//evil.example/path', '/library')).toBe('/library')
    expect(safeInternalReturnPath('/\\evil', '/library')).toBe('/library')
    expect(safeInternalReturnPath('%252F%252Fevil.example', '/library')).toBe('/library')
  })
})

describe('signup validation and availability', () => {
  it('keeps username and email validation focused on DP signup requirements', () => {
    expect(isValidEmail('student@example.com')).toBe(true)
    expect(isValidEmail('bad example.com')).toBe(false)
    expect(signupRoute).toContain('USERNAME_PATTERN')
    expect(signupRoute).toContain('Enter your full name.')
    expect(signupRoute).toContain('Enter a valid email address.')
  })

  it('checks availability through DP-only RPC names', () => {
    expect(availabilityRoute).toContain('dp_resource_is_username_available')
    expect(availabilityRoute).toContain('dp_resource_is_email_available')
    expect(signupRoute).toContain('dp_resource_is_username_available')
    expect(signupRoute).toContain('dp_resource_is_email_available')
  })
})

describe('OTP request and verification flow', () => {
  it('requests Supabase email OTP and verifies six-digit email tokens', () => {
    expect(signupRoute).toContain('signInWithOtp')
    expect(signupRoute).toContain('shouldCreateUser: true')
    expect(verifyOtpForm).toContain('OTP_LENGTH = 6')
    expect(verifyOtpForm).toContain('verifyOtp')
    expect(verifyOtpForm).toContain("type: 'email'")
    expect(verifyOtpForm).toContain('router.push(`/auth/set-password?next=')
  })
})

describe('DP-only schema and target code references', () => {
  it('defines the DP profile table and DP availability RPCs', () => {
    expect(schema).toContain('public.dp_resource_profiles')
    expect(schema).toContain('public.dp_resource_is_username_available')
    expect(schema).toContain('public.dp_resource_is_email_available')
  })

  it('does not reference forbidden database names in target auth code or schema', () => {
    const target = [signupRoute, availabilityRoute, verifyOtpForm, schema].join('\n')
    expect(target).not.toMatch(/public\.profiles\b/)
    expect(target).not.toMatch(/\bis_username_available\b(?![\w])/)
    expect(target).not.toMatch(/\bis_email_available\b(?![\w])/)
  })
})

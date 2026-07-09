import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isValidEmail } from '../lib/auth-email'
import { safeInternalReturnPath } from '../lib/auth-redirect'

const rootPage = readFileSync('app/page.tsx', 'utf8')
const rootLayout = readFileSync('app/layout.tsx', 'utf8')
const privacyPage = readFileSync('app/privacy/page.tsx', 'utf8')
const termsPage = readFileSync('app/terms/page.tsx', 'utf8')
const loginLayout = readFileSync('app/auth/login/layout.tsx', 'utf8')
const signUpLayout = readFileSync('app/auth/sign-up/layout.tsx', 'utf8')
const authPage = readFileSync('app/auth/page.tsx', 'utf8')
const signupRoute = readFileSync('app/api/auth/start-signup/route.ts', 'utf8')
const availabilityRoute = readFileSync('app/api/auth/availability/route.ts', 'utf8')
const verifyOtpForm = readFileSync('app/auth/verify-otp/verify-otp-form.tsx', 'utf8')
const schema = readFileSync('supabase/schema.sql', 'utf8')

describe('auth redirects and public entry points', () => {
  it('keeps the public homepage indexable while redirecting legacy auth entry points', () => {
    expect(rootPage).toContain('Free DP Study Resource Library')
    expect(rootPage).toContain('href="/auth/sign-up"')
    expect(rootPage).toContain('Sign up')
    expect(rootPage).not.toContain("redirect('/auth/login')")
    expect(authPage).toContain("params.mode === 'signup' ? '/auth/sign-up' : '/auth/login'")
  })

  it('uses free/open public wording instead of gated marketing language', () => {
    const publicCopy = [rootPage, rootLayout, privacyPage, termsPage, loginLayout, signUpLayout].join('\n')
    expect(publicCopy).toContain('free')
    expect(publicCopy).not.toMatch(/private|restricted|protected|request access/i)
  })

  it('redirects already signed-in users away from login and signup forms', () => {
    for (const layout of [loginLayout, signUpLayout]) {
      expect(layout).toContain('getSessionResourceMembership')
      expect(layout).toContain('if (user) redirect(\'/library\')')
    }
  })
})

describe('safe next-path handling', () => {
  it('accepts only safe internal return paths', () => {
    expect(safeInternalReturnPath('/library?folder=abc#top', '/library')).toBe('/library?folder=abc#top')
    expect(safeInternalReturnPath('https://evil.example', '/library')).toBe('/library')
    expect(safeInternalReturnPath('//evil.example/path', '/library')).toBe('/library')
    expect(safeInternalReturnPath(String.raw`/\evil`, '/library')).toBe('/library')
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
  it('requests Supabase signup OTP and verifies six-digit email tokens', () => {
    expect(signupRoute).toContain('signInWithOtp')
    expect(signupRoute).toContain('shouldCreateUser: true')
    expect(verifyOtpForm).toContain('OTP_LENGTH = 6')
    expect(verifyOtpForm).toContain('verifyOtp')
    expect(verifyOtpForm).toContain("type: 'signup'")
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

const awaitingApprovalPage = readFileSync('app/awaiting-approval/page.tsx', 'utf8')
const readme = readFileSync('README.md', 'utf8')

describe('compatibility redirect and OTP docs', () => {
  it('redirects the compatibility page to the library', () => {
    expect(awaitingApprovalPage).toContain("redirect('/library')")
    expect(awaitingApprovalPage).not.toContain('is_approved')
    expect(awaitingApprovalPage).not.toContain('Awaiting approval')
  })

  it('documents the Supabase Magic Link template token for email OTP', () => {
    expect(readme).toContain('Magic Link')
    expect(readme).toContain('{{ .Token }}')
    expect(readme).toContain('signInWithOtp')
    expect(readme).toContain('verifyOtp')
  })

  it('uses a migration timestamp later than the deployed 20260701102923 migration', () => {
    const migrationTimestamp = '20260701110000'
    expect(migrationTimestamp > '20260701102923').toBe(true)
    expect(existsSync(`supabase/migrations/${migrationTimestamp}_dp_resource_profiles_auth.sql`)).toBe(true)
    expect(existsSync('supabase/migrations/20260701000000_dp_resource_profiles_auth.sql')).toBe(false)
    expect(readme).toContain(`supabase/migrations/${migrationTimestamp}_dp_resource_profiles_auth.sql`)
  })
})

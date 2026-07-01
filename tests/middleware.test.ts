import { describe, expect, it } from 'vitest'
import { shouldBypassSupabaseMiddleware } from '../middleware'

describe('middleware auth route bypasses', () => {
  it('excludes public auth routes and auth APIs from Supabase getUser middleware handling', () => {
    const bypassedRoutes = [
      '/',
      '/auth',
      '/auth/login',
      '/auth/sign-up',
      '/auth/verify-otp',
      '/auth/set-password',
      '/auth/sign-up-success',
      '/auth/callback',
      '/api/auth/start-signup',
      '/api/auth/availability',
    ]

    for (const route of bypassedRoutes) {
      expect(shouldBypassSupabaseMiddleware(route)).toBe(true)
    }

    expect(shouldBypassSupabaseMiddleware('/library')).toBe(false)
    expect(shouldBypassSupabaseMiddleware('/admin')).toBe(false)
  })
})

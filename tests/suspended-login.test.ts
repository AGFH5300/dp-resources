import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSuspendedAuthError } from '../lib/suspension-auth';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('suspended login error detection', () => {
  it('recognizes Supabase banned-user errors without treating normal failures as suspensions', () => {
    expect(isSuspendedAuthError({ code: 'user_banned' })).toBe(true);
    expect(isSuspendedAuthError({ message: 'User is banned' })).toBe(true);
    expect(isSuspendedAuthError('Account suspended')).toBe(true);
    expect(isSuspendedAuthError('Invalid login credentials')).toBe(false);
  });
});

describe('suspended login details endpoint', () => {
  async function loadRoute(options: {
    authError: { code?: string; message: string } | null;
    membership?: {
      id: string;
      is_suspended: boolean;
      suspension_reason: string | null;
    } | null;
  }) {
    const signInWithPassword = vi.fn(async () => ({
      data: { user: null, session: null },
      error: options.authError,
    }));
    const maybeSingle = vi.fn(async () => ({
      data: options.membership ?? null,
      error: null,
    }));
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({ maybeSingle })),
      })),
    }));

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({ auth: { signInWithPassword } })),
    }));
    vi.doMock('../lib/request-security', () => ({
      sameOriginOrForbidden: vi.fn(() => null),
    }));
    vi.doMock('../lib/rate-limit', () => ({
      privacySafeRequestKey: vi.fn(() => 'request-key'),
      rateLimit: vi.fn(async () => ({ ok: true })),
    }));
    vi.doMock('../lib/supabase-admin', () => ({
      createSupabaseAdminClient: vi.fn(() => ({ from })),
    }));

    return {
      route: await import('../app/api/auth/suspended-login/route'),
      from,
    };
  }

  function request(password = 'correct-password') {
    return new Request('https://app.test/api/auth/suspended-login', {
      method: 'POST',
      body: JSON.stringify({ email: 'student@example.edu', password }),
    });
  }

  it('returns the reason only after Supabase confirms valid banned credentials', async () => {
    const { route, from } = await loadRoute({
      authError: { code: 'user_banned', message: 'User is banned' },
      membership: {
        id: '11111111-1111-4111-8111-111111111111',
        is_suspended: true,
        suspension_reason: 'Repeatedly sharing download links.',
      },
    });

    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suspended: true,
      userId: '11111111-1111-4111-8111-111111111111',
      suspensionReason: 'Repeatedly sharing download links.',
    });
    expect(from).toHaveBeenCalledWith('dp_resource_memberships');
  });

  it('does not query or reveal membership data for invalid credentials', async () => {
    const { route, from } = await loadRoute({
      authError: { message: 'Invalid login credentials' },
    });

    const response = await route.POST(request('wrong-password'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ suspended: false });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('login page suspended-account routing', () => {
  const source = readFileSync('app/auth/login/page.tsx', 'utf8');

  it('verifies a banned login, stores its own reason, and opens the dedicated page', () => {
    expect(source).toContain("fetch('/api/auth/suspended-login'");
    expect(source).toContain('SUSPENSION_REASON_STORAGE_KEY');
    expect(source).toContain('SUSPENDED_USER_ID_STORAGE_KEY');
    expect(source).toContain("router.replace('/account-suspended')");
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bootstrapAdminMembershipUpdate } from '../lib/supabase-admin';
import { pendingMembershipInsert } from '../lib/supabase';

const middlewareSource = readFileSync('middleware.ts', 'utf8');
const sessionHelperSource = readFileSync('lib/supabase.ts', 'utf8');

describe('bootstrap admin approval timestamp handling', () => {
  it('preserves an existing approved_at timestamp when promoting an admin', () => {
    expect(
      bootstrapAdminMembershipUpdate(
        { approved_at: '2026-01-02T03:04:05.000Z' },
        '2026-07-01T00:00:00.000Z',
      ),
    ).toEqual({
      role: 'admin',
      is_approved: true,
      approved_at: '2026-01-02T03:04:05.000Z',
    });
  });

  it('sets approved_at when the membership has no approval timestamp', () => {
    expect(
      bootstrapAdminMembershipUpdate(
        { approved_at: null },
        '2026-07-01T00:00:00.000Z',
      ),
    ).toEqual({
      role: 'admin',
      is_approved: true,
      approved_at: '2026-07-01T00:00:00.000Z',
    });
  });
});

describe('missing membership repair fallback', () => {
  it('inserts an immediately approved user membership and relies on conflict ignore to avoid overwrites', () => {
    expect(
      pendingMembershipInsert({ id: 'user-1', email: 'User@Example.com' }),
    ).toEqual({
      id: 'user-1',
      email: 'User@Example.com',
      role: 'user',
      is_approved: true,
      approved_at: expect.any(String),
    });
    expect(sessionHelperSource).toContain('ignoreDuplicates: true');
    expect(sessionHelperSource).toContain("onConflict: 'id'");
    expect(sessionHelperSource).not.toContain('approved_at: null');
  });
});

describe('middleware missing configuration resilience', () => {
  it('returns before creating a Supabase SSR client when public configuration is absent', () => {
    const configIndex = middlewareSource.indexOf('getSupabasePublicConfig()');
    const guardIndex = middlewareSource.indexOf('!supabaseUrl || !supabaseKey');
    const returnIndex = middlewareSource.indexOf(
      'return NextResponse.next()',
      guardIndex,
    );
    const createClientIndex = middlewareSource.indexOf('createServerClient(');

    expect(middlewareSource).toContain(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
    expect(configIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(configIndex);
    expect(returnIndex).toBeGreaterThan(guardIndex);
    expect(createClientIndex).toBeGreaterThan(returnIndex);
  });
});

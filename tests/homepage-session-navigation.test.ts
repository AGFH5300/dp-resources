import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homepage = readFileSync('app/page.tsx', 'utf8');

describe('homepage session-aware navigation', () => {
  it('shows library actions instead of login and signup actions for signed-in users', () => {
    expect(homepage).toContain("export const dynamic = 'force-dynamic'");
    expect(homepage).toContain('supabase.auth.getUser()');
    expect(homepage).toContain(
      "const accountHref = isSignedIn ? '/library' : '/auth/login'",
    );
    expect(homepage).toContain(
      "const accountLabel = isSignedIn ? 'Open library' : 'Log in'",
    );
    expect(homepage).toContain('{isSignedIn ? (');
    expect(homepage).toContain('href="/library"');
    expect(homepage).toContain('Open library');
  });

  it('keeps the existing login and signup choices for signed-out visitors', () => {
    expect(homepage).toContain('href="/auth/sign-up"');
    expect(homepage).toContain('href="/auth/login"');
    expect(homepage).toContain('Sign up');
    expect(homepage).toContain('Log in');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homepage = readFileSync('app/page.tsx', 'utf8');

describe('homepage session-aware navigation', () => {
  it('shows library and Question Bank actions for signed-in users', () => {
    expect(homepage).toContain("export const dynamic = 'force-dynamic'");
    expect(homepage).toContain('supabase.auth.getUser()');
    expect(homepage).toContain(
      "const accountHref = isSignedIn ? '/library' : '/auth/login'",
    );
    expect(homepage).toContain(
      "const accountLabel = isSignedIn ? 'Open library' : 'Log in'",
    );
    expect(homepage).toContain("? '/question-bank'");
    expect(homepage).toContain('href="/library"');
    expect(homepage).toContain('href="/question-bank"');
    expect(homepage).toContain('Open library');
    expect(homepage).toContain('Open question bank');
  });

  it('keeps login and signup choices while directing visitors back to the Question Bank', () => {
    expect(homepage).toContain('href="/auth/sign-up"');
    expect(homepage).toContain('href="/auth/login"');
    expect(homepage).toContain('/auth/login?next=%2Fquestion-bank');
    expect(homepage).toContain('Sign up');
    expect(homepage).toContain('Log in');
  });

  it('explains both major parts of the platform on the homepage', () => {
    expect(homepage).toContain('Library');
    expect(homepage).toContain('Question Bank');
    expect(homepage).toContain('Practise and understand.');
    expect(homepage).toContain('Instant answer feedback');
  });

  it('keeps the Question Bank action readable and the mobile header contained', () => {
    expect(homepage).toContain("bg-[#f2b84b]");
    expect(homepage).toContain("text-[#172033]");
    expect(homepage).toContain('flex flex-wrap items-center');
    expect(homepage).toContain('w-full items-center justify-end');
  });
});

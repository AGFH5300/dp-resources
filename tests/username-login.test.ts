import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const loginPage = readFileSync('app/auth/login/page.tsx', 'utf8');
const loginRoute = readFileSync('app/api/auth/login/route.ts', 'utf8');
const identifierResolver = readFileSync('lib/login-identifier.ts', 'utf8');
const nav = readFileSync('components/nav.tsx', 'utf8');
const appHeader = readFileSync('components/app-header.tsx', 'utf8');
const accountMenu = readFileSync('components/account-menu.tsx', 'utf8');

describe('username or email login', () => {
  it('labels the login identifier clearly and submits it to the protected login route', () => {
    expect(loginPage).toContain('Username / email');
    expect(loginPage).toContain('id="login-identifier"');
    expect(loginPage).toContain('autoComplete="username"');
    expect(loginPage).toContain("fetch('/api/auth/login'");
    expect(loginPage).toContain('identifier: identifier.trim()');
  });

  it('resolves case-insensitive usernames without exposing the lookup to the browser', () => {
    expect(identifierResolver).toContain("from('dp_resource_profiles')");
    expect(identifierResolver).toContain(".select('username,email')");
    expect(identifierResolver).toContain(".ilike('username'");
    expect(identifierResolver).toContain('createSupabaseAdminClient');
    expect(loginRoute).toContain('resolveLoginEmail(identifier)');
    expect(loginRoute).toContain('signInWithPassword');
    expect(loginRoute).toContain('Invalid username/email or password.');
  });
});

describe('username account display', () => {
  it('loads the signed-in profile username and passes it through the header', () => {
    expect(nav).toContain("from('dp_resource_profiles')");
    expect(nav).toContain(".select('username')");
    expect(nav).toContain('username={username}');
    expect(appHeader).toContain('username={username}');
  });

  it('shows the username instead of the account email', () => {
    expect(accountMenu).toContain('accountLabel = username?.trim()');
    expect(accountMenu).toContain('Signed in as');
    expect(accountMenu).not.toContain('{email}');
  });
});

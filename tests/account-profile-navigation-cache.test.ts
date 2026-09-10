import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('account profile navigation cache', () => {
  it('reuses one signed avatar URL across normal in-site navigation', () => {
    const cache = read('lib/account-profile-client.ts');
    const header = read('components/app-header.tsx');

    expect(cache).toContain('ACCOUNT_PROFILE_CACHE_TTL_MS = 45 * 60 * 1000');
    expect(cache).toContain('const profileCache = new Map');
    expect(cache).toContain('const profileRequests = new Map');
    expect(cache).toContain("fetch('/api/account/profile', { cache: 'no-store' })");
    expect(header).toContain('peekCachedAccountProfile(userId)');
    expect(header).toContain('loadAccountProfile(userId, { force })');
    expect(header).not.toContain("void fetch('/api/account/profile'");
  });

  it('only forces a profile refresh after an actual profile change', () => {
    const cache = read('lib/account-profile-client.ts');
    const header = read('components/app-header.tsx');

    expect(header).toContain('const handleProfileChanged = () => loadProfile(true)');
    expect(header).toContain("window.addEventListener('dp:profile-changed', handleProfileChanged)");
    expect(cache).toContain('await preloadAvatar(next.avatarUrl)');
    expect(cache).toContain('previous.avatarUrl !== next.avatarUrl');
  });
});

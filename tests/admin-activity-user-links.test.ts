import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildActivityUserModalUrl,
  validActivityReturnTarget,
} from '../components/admin/activity-user-links';

const bridgeSource = readFileSync(
  'components/admin/activity-user-links.tsx',
  'utf8',
);
const layoutSource = readFileSync('app/admin/layout.tsx', 'utf8');

describe('Admin Activity user links', () => {
  it('opens the existing Users resource analytics modal while preserving Activity filters', () => {
    const url = buildActivityUserModalUrl(
      '/admin',
      'section=activity&activityPage=3&email=student%40example.com&action=file_opened',
      '11111111-1111-4111-8111-111111111111',
    );
    const parsed = new URL(url, 'https://dp.resources.anshgupta.cc');

    expect(parsed.pathname).toBe('/admin');
    expect(parsed.searchParams.get('section')).toBe('users');
    expect(parsed.searchParams.get('userUsageId')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(parsed.searchParams.get('userUsageRange')).toBe('all');
    expect(parsed.searchParams.get('activityPage')).toBe('3');
    expect(parsed.searchParams.get('email')).toBe('student@example.com');
    expect(parsed.searchParams.get('action')).toBe('file_opened');
    expect(parsed.searchParams.has('userPage')).toBe(false);
  });

  it('only restores a recent same-page Activity URL after the modal closes', () => {
    const now = 2_000_000;
    const valid = JSON.stringify({
      url: '/admin?section=activity&activityPage=4&file=Biology',
      createdAt: now - 1_000,
    });
    const wrongSection = JSON.stringify({
      url: '/admin?section=users',
      createdAt: now - 1_000,
    });
    const stale = JSON.stringify({
      url: '/admin?section=activity',
      createdAt: now - 11 * 60 * 1_000,
    });

    expect(validActivityReturnTarget(valid, '/admin', now)).toBe(
      '/admin?section=activity&activityPage=4&file=Biology',
    );
    expect(validActivityReturnTarget(wrongSection, '/admin', now)).toBeNull();
    expect(validActivityReturnTarget(stale, '/admin', now)).toBeNull();
    expect(
      validActivityReturnTarget(
        JSON.stringify({
          url: '/other?section=activity',
          createdAt: now - 1_000,
        }),
        '/admin',
        now,
      ),
    ).toBeNull();
  });

  it('reuses the existing admin lookup without replacing React-owned table children', () => {
    expect(bridgeSource).toContain('/api/admin/users/search?q=');
    expect(bridgeSource).toContain("heading.textContent?.trim() === 'Activity'");
    expect(bridgeSource).toContain('row.children.item(1)');
    expect(bridgeSource).toContain('candidate.email?.trim().toLowerCase()');
    expect(bridgeSource).toContain("cell.dataset.dpActivityUserLink = 'true'");
    expect(bridgeSource).toContain("cell.setAttribute('role', 'button')");
    expect(bridgeSource).toContain('new MutationObserver(enhance)');
    expect(bridgeSource).toContain("document.addEventListener('click', onClick)");
    expect(bridgeSource).toContain('window.sessionStorage.setItem(RETURN_KEY');
    expect(bridgeSource).not.toContain('replaceChildren(');
    expect(bridgeSource).not.toContain('document.createElement(');
  });

  it('mounts the bridge behind Suspense in the shared Admin layout', () => {
    expect(layoutSource).toContain('AdminActivityUserLinksBridge');
    expect(layoutSource).toContain('<Suspense fallback={null}>');
    expect(layoutSource).toContain('<AdminActivityUserLinksBridge />');
  });
});

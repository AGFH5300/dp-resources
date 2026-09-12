import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bridgeSource = readFileSync(
  'components/admin/activity-user-links.tsx',
  'utf8',
);
const detailRoute = readFileSync(
  'app/api/admin/users/activity-detail/route.ts',
  'utf8',
);
const layoutSource = readFileSync('app/admin/layout.tsx', 'utf8');

describe('Admin Activity user links', () => {
  it('opens user details directly over Activity without navigating to Users', () => {
    expect(bridgeSource).toContain('/api/admin/users/activity-detail?email=');
    expect(bridgeSource).toContain('setOpenEmail(email)');
    expect(bridgeSource).toContain('Loading user details…');
    expect(bridgeSource).not.toContain("params.set('section', 'users')");
    expect(bridgeSource).not.toContain('router.push(');
    expect(bridgeSource).not.toContain('router.replace(');
    expect(bridgeSource).not.toContain('sessionStorage');
  });

  it('keeps the existing Activity table React-owned while making emails interactive', () => {
    expect(bridgeSource).toContain("heading.textContent?.trim() === 'Activity'");
    expect(bridgeSource).toContain('row.children.item(1)');
    expect(bridgeSource).toContain("userCell.dataset.dpActivityUserLink = 'true'");
    expect(bridgeSource).toContain("userCell.setAttribute('role', 'button')");
    expect(bridgeSource).toContain('new MutationObserver(enhance)');
    expect(bridgeSource).toContain("document.addEventListener('click', onClick)");
    expect(bridgeSource).not.toContain('replaceChildren(');
    expect(bridgeSource).not.toContain('document.createElement(');
  });

  it('labels Question Bank activity clearly', () => {
    expect(bridgeSource).toContain("actionCell.textContent?.trim() === 'question_opened'");
    expect(bridgeSource).toContain('Opened Question Bank question');
  });

  it('loads analytics through an admin-only no-store endpoint', () => {
    expect(detailRoute).toContain('await requireAdmin()');
    expect(detailRoute).toContain(".from('dp_admin_user_aliases')");
    expect(detailRoute).toContain(".rpc('dp_admin_resource_usage_for_user'");
    expect(detailRoute).toContain("Cache-Control', 'private, no-store, max-age=0'");
  });

  it('mounts the bridge behind Suspense in the shared Admin layout', () => {
    expect(layoutSource).toContain('AdminActivityUserLinksBridge');
    expect(layoutSource).toContain('<Suspense fallback={null}>');
    expect(layoutSource).toContain('<AdminActivityUserLinksBridge />');
  });
});

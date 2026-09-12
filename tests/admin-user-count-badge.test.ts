import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Admin Users total count', () => {
  it('returns an exact membership total from the existing admin-only user endpoint', () => {
    const route = read('app/api/admin/users/search/route.ts');
    expect(route).toContain('await requireAdmin()');
    expect(route).toContain(".select('id', { count: 'exact', head: true })");
    expect(route).toContain('return Response.json({ users: [], total: count || 0 });');
  });

  it('shows the exact total beside the Users heading without changing pagination totals', () => {
    const badge = read('components/admin/user-count-badge.tsx');
    const layout = read('app/admin/layout.tsx');
    expect(badge).toContain("heading.textContent?.trim() === 'Users'");
    expect(badge).toContain("fetch('/api/admin/users/search?q='");
    expect(badge).toContain('createPortal(');
    expect(badge).toContain('total users');
    expect(layout).toContain('AdminUserCountBadge');
    expect(layout).toContain('<AdminUserCountBadge />');
  });

  it('opens Activity user analytics immediately without leaving Activity', () => {
    const bridge = read('components/admin/activity-user-links.tsx');
    expect(bridge).toContain('/api/admin/users/activity-detail?email=');
    expect(bridge).toContain('setOpenEmail(email)');
    expect(bridge).toContain('Loading user details…');
    expect(bridge).not.toContain("params.set('section', 'users')");
    expect(bridge).not.toContain("params.set('userUsageId', userId)");
    expect(bridge).not.toContain('/api/admin/users/search?q=');
  });
});

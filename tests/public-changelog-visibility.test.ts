import { describe, expect, it } from 'vitest';
import { publicChangelogEntries } from '../lib/public-changelog';

const entry = (id: string, summary: string) => ({
  id,
  summary,
  date: '2026-09-08T12:00:00.000Z',
});

describe('public changelog visibility', () => {
  it('keeps student-facing updates and hides admin-only or infrastructure work', () => {
    const visible = publicChangelogEntries([
      entry(
        'resource-preview-reliability',
        'Improved resource preview reliability so intermittent connection failures retry automatically.',
      ),
      entry(
        'admin-activity-user-links',
        'Made user emails in Admin Activity clickable so admins can open user analytics.',
      ),
      entry(
        'live-library-index',
        'Rebuilt the Admin Library index with throughput, ETA, pause and resume controls.',
      ),
      entry(
        'security-build-hardening',
        'Strengthened the production runtime with a non-root process and pinned build automation dependencies.',
      ),
      entry(
        'frontend-secret-boundary',
        'Removed browser API-key dependencies and added client-bundle secret checks.',
      ),
      entry(
        'sign-in-security',
        'Strengthened sign-in sessions and HTTPS transport for users.',
      ),
    ]);

    expect(visible.map((item) => item.id)).toEqual([
      'resource-preview-reliability',
      'sign-in-security',
    ]);
  });
});

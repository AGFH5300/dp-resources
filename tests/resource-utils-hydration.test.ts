import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/resource-utils';

describe('resource date formatting', () => {
  it('is deterministic across server and browser time zones', () => {
    expect(formatDate('2026-09-03T00:30:00.000Z')).toBe('Sep 3, 2026');
    expect(formatDate('2026-09-03T23:30:00.000-11:00')).toBe('Sep 4, 2026');
  });

  it('handles absent and invalid dates without throwing', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});

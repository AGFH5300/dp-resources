import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { nativeFormulaBookletUrl } from '@/lib/question-bank/formula-booklets';

const adminPage = readFileSync('app/admin/question-bank/page.tsx', 'utf8');
const adminTabs = readFileSync('app/admin/admin-section-tabs.tsx', 'utf8');

describe('Question Bank admin clarity', () => {
  it('keeps every admin section visible and explains the real question total', () => {
    expect(adminPage).toContain('AdminSectionTabs');
    expect(adminPage).toContain('Actual Question Bank total');
    expect(adminPage).toContain('Question appearances');
    expect(adminPage).toContain('Topic links');
    expect(adminPage).toContain('InfoTip');
    expect(adminTabs).toContain('Library index');
    expect(adminTabs).toContain('Resource reports');
    expect(adminTabs).toContain('Support tickets');
    expect(adminTabs).toContain('Usage analytics');
  });

  it('does not attach a native booklet to the wrong syllabus', () => {
    expect(nativeFormulaBookletUrl('biology', 'hl-2025')).toBeNull();
    expect(nativeFormulaBookletUrl('physics', 'hl')).toBeNull();
    expect(nativeFormulaBookletUrl('physics', 'hl-2025')).toBe(
      '/resource/1WxDMiuD6WpwVvamNPelQDn9Ufffwz8SM',
    );
    expect(nativeFormulaBookletUrl('chemistry', 'sl')).toBeNull();
    expect(nativeFormulaBookletUrl('chemistry', 'sl-2025')).toBe(
      '/resource/1C7tYritD2g7zVHXt1376HFuQstwaaZJZ',
    );
  });
});

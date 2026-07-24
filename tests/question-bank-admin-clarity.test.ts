import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  nativeBookletCoverage,
  nativeFormulaBookletUrl,
} from '@/lib/question-bank/formula-booklets';

const adminPage = readFileSync('app/admin/question-bank/page.tsx', 'utf8');
const adminTabs = readFileSync('app/admin/admin-section-tabs.tsx', 'utf8');

describe('Question Bank admin clarity', () => {
  it('keeps every admin section visible on the dedicated Question Bank page', () => {
    expect(adminPage).toContain(
      '<AdminSectionTabs activeSection="question-bank" />',
    );
    expect(adminTabs).toContain('Library index');
    expect(adminTabs).toContain('Question bank');
    expect(adminTabs).toContain('Resource reports');
    expect(adminTabs).toContain('Support tickets');
    expect(adminTabs).toContain('Users');
    expect(adminTabs).toContain('Activity');
    expect(adminTabs).toContain('Usage analytics');
    expect(adminTabs).toContain('Diagnostics');
  });

  it('makes the actual question total and supporting counts unambiguous', () => {
    expect(adminPage).toContain('Actual Question Bank total');
    expect(adminPage).toContain('unique questions');
    expect(adminPage).toContain('Question appearances');
    expect(adminPage).toContain('Topic links');
    expect(adminPage).toContain('Imported source files');
    expect(adminPage).toContain('Question images');
    expect(adminPage).toContain(
      'larger totals do not mean there are extra questions.',
    );
    expect(adminPage).toContain('InfoTip');
  });

  it('reports native booklet coverage without linking a booklet to the wrong syllabus', () => {
    expect(nativeFormulaBookletUrl('biology', 'hl-2025')).toBeNull();
    expect(nativeFormulaBookletUrl('physics', 'hl')).toBeNull();
    expect(nativeFormulaBookletUrl('physics', 'hl-2025')).toBe(
      '/resource/1WxDMiuD6WpwVvamNPelQDn9Ufffwz8SM',
    );
    expect(nativeFormulaBookletUrl('chemistry', 'sl')).toBeNull();
    expect(nativeFormulaBookletUrl('chemistry', 'sl-2025')).toBe(
      '/resource/1C7tYritD2g7zVHXt1376HFuQstwaaZJZ',
    );
    expect(
      nativeBookletCoverage.some((item) => item.status === 'missing'),
    ).toBe(true);
    expect(adminPage).toContain(
      'Every booklet button currently shown to users opens an internal DP',
    );
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { nativeFormulaBookletUrl } from '@/lib/question-bank/formula-booklets';

const operationsPage = readFileSync('app/admin/question-bank/page.tsx', 'utf8');
const sectionTabs = readFileSync('app/admin/admin-section-tabs.tsx', 'utf8');

describe('Question Bank operations clarity', () => {
  it('keeps every section accessible and explains the real question total', () => {
    expect(operationsPage).toContain('AdminSectionTabs');
    expect(operationsPage).toContain('Actual Question Bank total');
    expect(operationsPage).toContain('Question appearances');
    expect(operationsPage).toContain('Topic links');
    expect(operationsPage).toContain('InfoTip');
    expect(sectionTabs).toContain('Library index');
    expect(sectionTabs).toContain('Question bank');
    expect(sectionTabs).toContain('Resource reports');
    expect(sectionTabs).toContain('Support tickets');
    expect(sectionTabs).toContain('Users');
    expect(sectionTabs).toContain('Activity');
    expect(sectionTabs).toContain('Usage analytics');
    expect(sectionTabs).toContain('Diagnostics');
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

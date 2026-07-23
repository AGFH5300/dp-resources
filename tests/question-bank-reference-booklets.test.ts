import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { nativeFormulaBookletUrl } from '@/lib/question-bank/formula-booklets';
import {
  isOldCourse,
  oldCourseFinalAssessmentYear,
} from '@/lib/question-bank/presentation';

describe('question-bank course presentation and reference booklets', () => {
  const legacyChemistry = {
    id: 'chemistry-sl-legacy',
    name: 'Chemistry SL',
    level: 'SL',
    syllabus_label: 'Legacy syllabus',
  };
  const currentChemistry = {
    id: 'chemistry-sl-current',
    name: 'Chemistry SL',
    level: 'SL',
    syllabus_label: 'First assessment 2025',
  };

  it('derives the final assessment year from the replacement course', () => {
    const courses = [legacyChemistry, currentChemistry];
    expect(isOldCourse(legacyChemistry, courses)).toBe(true);
    expect(oldCourseFinalAssessmentYear(legacyChemistry, courses)).toBe(2024);
    expect(oldCourseFinalAssessmentYear(currentChemistry, courses)).toBeNull();
  });

  it('prefers an explicitly recorded final assessment year', () => {
    const legacy = {
      ...legacyChemistry,
      syllabus_label: 'Previous course · Final assessment 2023',
    };
    expect(
      oldCourseFinalAssessmentYear(legacy, [legacy, currentChemistry]),
    ).toBe(2023);
  });

  it('uses the native DP Resources Business formula booklet', () => {
    expect(nativeFormulaBookletUrl('business', 'sl')).toBe(
      '/resource/1VdwxdTi5-6JmCE3z8iLS9ma4VKLwv7y2',
    );
    expect(nativeFormulaBookletUrl('business', 'hl')).toBe(
      '/resource/1VdwxdTi5-6JmCE3z8iLS9ma4VKLwv7y2',
    );
  });

  it('uses an environmental systems icon rather than the generic leaf', () => {
    const icons = readFileSync(
      'components/question-bank/subject-icon.tsx',
      'utf8',
    );
    expect(icons).toContain('ess: Earth');
    expect(icons).not.toContain('ess: Leaf');
  });
});

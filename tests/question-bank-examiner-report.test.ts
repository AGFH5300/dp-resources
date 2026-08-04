import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { hasSubstantiveExaminerReport } from '@/lib/question-bank/examiner-report';

describe('Question Bank examiner-report visibility', () => {
  it('uses the substantive-content check in both the API and workspace', () => {
    const route = readFileSync(
      'app/api/question-bank/questions/[variantId]/route.ts',
      'utf8',
    );
    const workspace = readFileSync(
      'components/question-bank/course-practice-workspace.tsx',
      'utf8',
    );
    expect(route).toContain(
      'hasSubstantiveExaminerReport(question.examiner_report)',
    );
    expect(workspace).toContain('const hasExaminerReport =');
    expect(workspace).toContain('hasExaminerReport ?');
    expect(workspace).not.toContain('{detail.question.examinerReport ? (');
  });

  it('hides empty and imported N/A-only reports', () => {
    expect(hasSubstantiveExaminerReport('')).toBe(false);
    expect(
      hasSubstantiveExaminerReport(
        String.raw`\[N/A\]

**.**

\[N/A\]

**.**`,
      ),
    ).toBe(false);
    expect(hasSubstantiveExaminerReport('[N/A]\n\na.\n\nN/A\n\nb.')).toBe(
      false,
    );
    expect(hasSubstantiveExaminerReport('No examiner report available.')).toBe(
      false,
    );
  });

  it('keeps substantive prose, maths, and media reports', () => {
    expect(
      hasSubstantiveExaminerReport(
        'Candidates generally explained the final step clearly.',
      ),
    ).toBe(true);
    expect(hasSubstantiveExaminerReport(String.raw`\[x = 2\]`)).toBe(true);
    expect(
      hasSubstantiveExaminerReport(
        '![Examiner diagram](examiner_report:123e4567-e89b-12d3-a456-426614174000)',
      ),
    ).toBe(true);
  });
});

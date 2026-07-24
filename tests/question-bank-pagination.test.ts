import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  questionResultRange,
  visibleQuestionPages,
} from '@/components/question-bank/question-results-pagination';

describe('Question Bank pagination', () => {
  it('numbers a 101-question result set continuously across five pages', () => {
    expect(questionResultRange(101, 1)).toEqual({ start: 1, end: 24 });
    expect(questionResultRange(101, 2)).toEqual({ start: 25, end: 48 });
    expect(questionResultRange(101, 3)).toEqual({ start: 49, end: 72 });
    expect(questionResultRange(101, 4)).toEqual({ start: 73, end: 96 });
    expect(questionResultRange(101, 5)).toEqual({ start: 97, end: 101 });
  });

  it('shows direct page choices around the active page', () => {
    expect(visibleQuestionPages(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(visibleQuestionPages(8, 12)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });

  it('replaces the old ambiguous controls and offsets visible question numbers', () => {
    const page = readFileSync(
      'app/question-bank/[subjectSlug]/[courseSlug]/page.tsx',
      'utf8',
    );
    const styles = readFileSync(
      'components/question-bank/question-results-pagination.module.css',
      'utf8',
    );

    expect(page).toContain('QuestionResultsPagination');
    expect(page).toContain('visibleQuestionPages');
    expect(styles).toContain('counter-reset: qb-question var(--qb-question-offset)');
    expect(styles).toContain('counter-increment: qb-question');
    expect(styles).toContain(':global(html[data-theme=\'dark\']) .direction');
  });
});

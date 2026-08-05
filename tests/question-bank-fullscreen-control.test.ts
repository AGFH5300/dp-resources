import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const coursePage = readFileSync(
  'app/question-bank/[subjectSlug]/[courseSlug]/page.tsx',
  'utf8',
);
const customSessionPage = readFileSync(
  'components/question-bank/local-practice-session-page.tsx',
  'utf8',
);
const courseStyles = readFileSync(
  'app/question-bank/[subjectSlug]/[courseSlug]/course-question-bank.module.css',
  'utf8',
);
const sharedStyles = readFileSync(
  'components/question-bank/question-practice-fullscreen-control.module.css',
  'utf8',
);
const fullscreenControl = readFileSync(
  'components/question-bank/question-practice-fullscreen-control.tsx',
  'utf8',
);

describe('Question Bank practice layout', () => {
  it('keeps route-specific styles out of the shared full-width mode', () => {
    expect(courseStyles).not.toContain('dp-qb-practice-fullscreen');
    expect(courseStyles).not.toContain('is-question-focus');
  });

  it('offers fullscreen from both course and custom practice routes', () => {
    expect(coursePage).toContain('<QuestionPracticeFullscreenControl />');
    expect(customSessionPage).toContain('<QuestionPracticeFullscreenControl />');
    expect(fullscreenControl).toContain('Maximize2');
    expect(fullscreenControl).toContain('Minimize2');
    expect(fullscreenControl).toContain('QUESTION_FOCUS_CLASS');
    expect(fullscreenControl).toContain("'is-question-focus'");
    expect(fullscreenControl).not.toContain('requestFullscreen');
    expect(fullscreenControl).toContain('Restore question list');
    expect(fullscreenControl).toContain('Show question full width');
  });

  it('expands the question within the page and hides only the result list', () => {
    expect(sharedStyles).toContain('is-question-focus');
    expect(sharedStyles).toContain("section[aria-label='Question results']");
    expect(sharedStyles).toContain('width: 100%');
    expect(sharedStyles).toContain('max-width: none');
    expect(sharedStyles).not.toContain(':fullscreen');
    expect(sharedStyles).not.toContain('100vw');
    expect(sharedStyles).not.toContain('.coursePage');
  });
});

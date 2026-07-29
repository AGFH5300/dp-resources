import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const coursePage = readFileSync(
  'app/question-bank/[subjectSlug]/[courseSlug]/page.tsx',
  'utf8',
);
const courseStyles = readFileSync(
  'app/question-bank/[subjectSlug]/[courseSlug]/course-question-bank.module.css',
  'utf8',
);
const fullscreenControl = readFileSync(
  'components/question-bank/question-practice-fullscreen-control.tsx',
  'utf8',
);

describe('Question Bank practice layout', () => {
  it('keeps the normal selected-question view compact', () => {
    expect(courseStyles).not.toContain(
      '.dp-qb-practice-layout.is-open .dp-qb-practice-pane',
    );
    expect(courseStyles).not.toContain(
      ".dp-qb-practice-layout.is-open > section[aria-label='Question results']",
    );
  });

  it('offers an explicit fullscreen action from the compact view', () => {
    expect(coursePage).toContain('<QuestionPracticeFullscreenControl />');
    expect(fullscreenControl).toContain('Maximize2');
    expect(fullscreenControl).toContain('Minimize2');
    expect(fullscreenControl).toContain("classList.toggle('is-fullscreen'");
    expect(fullscreenControl).toContain('Exit fullscreen question view');
  });

  it('only applies the fullscreen overlay after the user chooses it', () => {
    expect(courseStyles).toContain('.dp-qb-practice-layout.is-fullscreen');
    expect(courseStyles).toContain('position: fixed !important');
    expect(courseStyles).toContain('height: 100dvh');
    expect(courseStyles).toContain('@media (max-width: 1279px)');
  });
});

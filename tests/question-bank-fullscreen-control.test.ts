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

function selectorsContaining(styles: string, fragment: string) {
  const withoutComments = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors: string[] = [];
  let boundary = 0;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (character === '{') {
      const ruleHeader = withoutComments.slice(boundary, index).trim();
      if (!ruleHeader.startsWith('@')) {
        selectors.push(
          ...ruleHeader
            .split(',')
            .map((selector) => selector.trim())
            .filter((selector) => selector.includes(fragment)),
        );
      }
      boundary = index + 1;
    } else if (character === '}' || character === ';') {
      boundary = index + 1;
    }
  }
  return selectors;
}

describe('Question Bank practice layout', () => {
  it('keeps the normal selected-question view compact', () => {
    const guardedRoot = ':global(html.dp-qb-practice-fullscreen)';
    const compactOverrides = selectorsContaining(
      courseStyles,
      ':global(.dp-qb-practice-layout.is-open)',
    );
    const resultOverrides = selectorsContaining(
      courseStyles,
      ":global(.dp-qb-practice-layout.is-open > section[aria-label='Question results'])",
    );
    expect(compactOverrides).not.toHaveLength(0);
    expect(resultOverrides).not.toHaveLength(0);
    expect(compactOverrides.every((selector) => selector.includes(guardedRoot))).toBe(
      true,
    );
    expect(resultOverrides.every((selector) => selector.includes(guardedRoot))).toBe(
      true,
    );
  });

  it('offers an explicit fullscreen action from the compact view', () => {
    expect(coursePage).toContain('<QuestionPracticeFullscreenControl />');
    expect(fullscreenControl).toContain('Maximize2');
    expect(fullscreenControl).toContain('Minimize2');
    expect(fullscreenControl).toContain('FULLSCREEN_ROOT_CLASS');
    expect(fullscreenControl).toContain('document.documentElement.classList.toggle');
    expect(fullscreenControl).toContain('Exit fullscreen question view');
  });

  it('only applies the fullscreen overlay after the user chooses it', () => {
    expect(courseStyles).toContain('html.dp-qb-practice-fullscreen');
    expect(courseStyles).toContain('position: fixed !important');
    expect(courseStyles).toContain('height: 100dvh');
    expect(courseStyles).toContain('@media (max-width: 1279px)');
  });
});

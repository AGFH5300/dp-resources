import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync('app/globals.css', 'utf8');
const landing = readFileSync('app/question-bank/page.tsx', 'utf8');
const recent = readFileSync('app/recent/page.tsx', 'utf8');

describe('Question Bank recent-card containment', () => {
  it('keeps long Exam-Mate references and course names inside the sidebar card', () => {
    expect(css).toContain('.dp-qb-recent-link {');
    expect(css).toContain('max-width: 100%');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 45%)');
    expect(css).toContain('.dp-qb-recent-heading strong {\n  min-width: 0');
    expect(landing).toContain('<strong title={row.question.reference}>');
    expect(landing).toContain('<small title={row.course.name}>{row.course.name}</small>');
  });

  it('stacks and truncates long ESS metadata on the Recent page', () => {
    expect(recent).toContain(
      'className="dp-qb-recent-link dp-qb-recent-grid-link"',
    );
    expect(recent).toContain('<small title={variant.course.name}>{variant.course.name}</small>');
    expect(css).toContain('.dp-qb-recent-grid-link {');
    expect(css).toContain(
      '.dp-qb-recent-grid-link > :is(strong, span, small) {',
    );
    expect(css).toContain('text-overflow: ellipsis');
  });
});

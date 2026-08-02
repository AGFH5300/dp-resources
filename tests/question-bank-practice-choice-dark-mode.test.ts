import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const landing = readFileSync('app/question-bank/page.tsx', 'utf8');
const joinModal = readFileSync(
  'components/question-bank/question-bank-join-modal.tsx',
  'utf8',
);

describe('Question Bank practice choices', () => {
  it('uses distinct, theme-aware colour treatments for all three entry points', () => {
    const courseCardStart = landing.indexOf('href="#courses"');
    const courseCardEnd = landing.indexOf('</Link>', courseCardStart);
    const courseCard = landing.slice(courseCardStart, courseCardEnd);
    const buildCardStart = landing.indexOf('href="/question-bank/build"');
    const buildCardEnd = landing.indexOf('</Link>', buildCardStart);
    const buildCard = landing.slice(buildCardStart, buildCardEnd);

    expect(courseCardStart).toBeGreaterThan(-1);
    expect(courseCard).toContain('from-emerald-50');
    expect(courseCard).toContain('dark:from-emerald-950/45');
    expect(buildCardStart).toBeGreaterThan(-1);
    expect(buildCard).toContain('from-indigo-50');
    expect(buildCard).toContain('dark:from-indigo-950/45');
    expect(buildCard).toContain('Build a practice set');
    expect(joinModal).toContain('from-amber-50');
    expect(joinModal).toContain('dark:from-amber-950/45');
    expect(joinModal).toContain('Join with a code');
  });
});

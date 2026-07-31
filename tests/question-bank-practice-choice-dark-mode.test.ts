import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const landing = readFileSync('app/question-bank/page.tsx', 'utf8');

describe('Question Bank practice choices', () => {
  it('uses the shared theme-aware surface for the custom practice card', () => {
    const buildCardStart = landing.indexOf('href="/question-bank/build"');
    const buildCardEnd = landing.indexOf('</Link>', buildCardStart);
    const buildCard = landing.slice(buildCardStart, buildCardEnd);

    expect(buildCardStart).toBeGreaterThan(-1);
    expect(buildCard).toContain('bg-white');
    expect(buildCard).not.toContain('bg-gradient-to-br');
    expect(buildCard).toContain('Build a practice set');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const landing = read('app/question-bank/page.tsx');
const builder = read('app/question-bank/build/page.tsx');
const counts = read('lib/question-bank/course-counts.ts');

describe('Question Bank timeout resilience', () => {
  it('never calls array methods on a null source-options RPC payload', () => {
    expect(landing).toContain('Array.isArray(sourceOptionsResult.data)');
    expect(builder).toContain('Array.isArray(sourceOptionsResult.data)');
    expect(landing).not.toContain('(sourceRows as any[]).filter');
    expect(builder).not.toContain('(sourceRows as any[])');
  });

  it('treats optional course counts as fail-soft UI metadata', () => {
    expect(counts).toContain('return new Map<string, number>();');
    expect(counts).not.toContain('throw new Error(`Question Bank course counts:');
  });

  it('does not speculate the heavyweight Practice Builder route from landing cards', () => {
    const builderLinks = landing.match(/href="\/question-bank\/build"/g) || [];
    const disabledPrefetches = landing.match(/prefetch=\{false\}/g) || [];
    expect(builderLinks.length).toBeGreaterThanOrEqual(2);
    expect(disabledPrefetches.length).toBeGreaterThanOrEqual(2);
  });
});

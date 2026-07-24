import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';
import { parseInteractiveQuestion } from '@/lib/question-bank/interactive';

describe('Question Bank source repair', () => {
  it('removes duplicate maximum-mark headers even when the closing bracket is escaped', () => {
    const source = String.raw`[Maximum mark: 15\]

Calculate the maximum height. :marks[3]`;

    const normalized = normalizeQuestionSource(source);
    expect(normalized).toBe('Calculate the maximum height. :marks[3]');
    expect(normalized).not.toContain('Maximum mark');
  });

  it('extracts all four choices when harmless source debris separates them', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`Two masses $M$ and $m$ are connected by a rod.

What is the moment of inertia?

::indent
- A. $\dfrac{L^2 (M+m)}{4}$

- B. $\dfrac{L^2 (M+4m)}{9}$
$

- C. $L^2 (M+m)$

- D. $L^2 (M+4m)$`,
      ':answer[**B**]\nThe result is $\\dfrac{L^2(M+4m)}{9}$.',
    );

    expect(parsed.choices.map((choice) => choice.id)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(parsed.correctChoiceId).toBe('B');
    expect(parsed.choices[1].source).toContain('M+4m');
    expect(parsed.prompt).not.toContain('- C.');
    expect(parsed.prompt).not.toContain('\n$\n');
  });

  it('ships the narrow idempotent PH0702 data correction', () => {
    const migration = readFileSync(
      'supabase/migrations/20260724154500_repair_ph0702_answer_choice.sql',
      'utf8',
    );

    expect(migration).toContain("reference = 'PH0702'");
    expect(migration).toContain('L^2 (M+4m)}{9}');
    expect(migration).toContain('dp_qb_question_search');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';
import { parseInteractiveQuestion } from '@/lib/question-bank/interactive';

const migration = readFileSync(
  'supabase/migrations/20260724162500_question_bank_render_audit.sql',
  'utf8',
);
const toaster = readFileSync('components/sonner-provider.tsx', 'utf8');

describe('Question Bank render safeguards', () => {
  it('removes escaped maximum-mark metadata while keeping part marks', () => {
    const normalized = normalizeQuestionSource(String.raw`\[Maximum mark: 15\]

Calculate the value. :marks[3]`);

    expect(normalized).not.toMatch(/maximum mark/i);
    expect(normalized).toContain(':marks[3]');
  });

  it('converts paired standalone math delimiters and discards orphan ones', () => {
    const display = normalizeQuestionSource(String.raw`Use the reaction:
$
\ce{H2 + O2 -> H2O}
$`);
    const orphan = normalizeQuestionSource(String.raw`- A. $x$
$
- B. $y$`);

    expect(display).toContain('$$\n\\ce{H2 + O2 -> H2O}\n$$');
    expect(orphan).not.toMatch(/^\s*\$\s*$/m);
    expect(orphan).toContain('- B. $y$');
  });

  it('extracts all choices across harmless source debris', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`What is the result?

- A. $1$

- B. $2$
$

- C. $3$

- D. $4$`,
      ':answer[**B**]',
    );
    expect(parsed.choices.map((choice) => choice.id)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(parsed.correctChoiceId).toBe('B');
    expect(parsed.prompt).not.toContain('- C.');
  });

  it('keeps table and image choices visible with a dependable A-D selector', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`Choose the correct graph.

:::tableoptions{col1="hide"}
| A. | ![A](question:11111111-1111-4111-8111-111111111111) |
| B. | ![B](question:22222222-2222-4222-8222-222222222222) |
| C. | ![C](question:33333333-3333-4333-8333-333333333333) |
| D. | ![D](question:44444444-4444-4444-8444-444444444444) |`,
      ':answer[**C**]',
    );

    expect(parsed.prompt).toContain('question:11111111-1111-4111-8111-111111111111');
    expect(parsed.choices.map((choice) => choice.id)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(parsed.correctChoiceId).toBe('C');
  });

  it('quarantines incomplete variants and filters them from every user RPC', () => {
    expect(migration).toContain("else 'quarantined'");
    expect(migration).toContain('blank_question_content');
    expect(migration).toContain("'missing_' || referenced_images.role || '_image'");
    expect(migration).toContain("variant.render_status = 'ready'");
    expect(migration).toContain('dp_qb_audit_variant_asset_change');
  });

  it('repairs authoritative mark totals and the known one-mark MCQs', () => {
    expect(migration).toContain('parsed_marks.header_mark');
    expect(migration).toContain("'BI0604', 'ES0198', 'PH0195', 'PH0366', 'PH0746'");
  });
});

describe('Sonner close-button alignment', () => {
  it('keeps the complete circular hit area inside the toast', () => {
    expect(toaster).toContain('position: relative !important');
    expect(toaster).toContain('padding-inline-end: 4rem !important');
    expect(toaster).toContain('top: 1.125rem !important');
    expect(toaster).toContain('right: 1.125rem !important');
    expect(toaster).toContain('inset-block-start: 1.125rem !important');
    expect(toaster).toContain('inset-inline-end: 1.125rem !important');
    expect(toaster).toContain('transform: none !important');
    expect(toaster).toContain('place-items: center !important');
    expect(toaster).not.toContain('translate(40%, -40%)');
    expect(toaster).not.toContain('overflow: visible !important');
  });
});

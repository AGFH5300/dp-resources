import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('question-bank paper family filter', () => {
  it('offers one-click all-session paper choices while retaining exact papers', () => {
    const filters = read('components/question-bank/question-bank-filters.tsx');
    expect(filters).toContain('Paper ${number} · all sessions');
    expect(filters).toContain('Every Paper ${number} question across all years, sessions and time zones');
    expect(filters).toContain("paperNumber: value.slice(PAPER_NUMBER_PREFIX.length)");
    expect(filters).toContain("paperRef: value.slice(PAPER_REFERENCE_PREFIX.length)");
    expect(filters).toContain('paper: null');
  });

  it('passes aggregate and exact-reference filters to the question query', () => {
    const queries = read('lib/question-bank/queries.ts');
    expect(queries).toContain('paperNumber: selectedPaperNumber');
    expect(queries).toContain('paperReference: selectedPaperReference');
    expect(queries).toContain('p_paper_number: filters.paperNumber');
    expect(queries).toContain('p_paper_reference: filters.paperReference');
    expect(queries).toContain('new Map(rawPapers.map');
  });

  it('filters paper families and exact references in SQL before pagination', () => {
    const migration = read(
      'supabase/migrations/20260912175000_question_bank_paper_family_filters.sql',
    );
    expect(migration).toContain('p_paper_number integer default null');
    expect(migration).toContain('p_paper_reference text default null');
    expect(migration).toContain("lower(paper.reference) = lower(p_paper_reference)");
    expect(migration).toContain("from 'paper[[:space:]]+([0-9]+)'");
    expect(migration).toContain('::integer = p_paper_number');
    expect(migration).toContain('partition by filtered.question_id');
  });
});

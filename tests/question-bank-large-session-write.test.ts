import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260801223000_question_bank_large_session_write.sql',
  ),
  'utf8',
);

describe('large Question Bank session writes', () => {
  it('materializes generated items and candidate eligibility once', () => {
    expect(migration).toContain('pg_temp.dp_qb_session_items_stage');
    expect(migration).toContain('pg_temp.dp_qb_session_eligible_stage');
    expect(migration).toContain('from public.dp_qb_practice_candidates(');
    expect(migration).toContain('dp_qb_session_eligible_lookup_idx');
    expect(migration).not.toMatch(
      /jsonb_array_elements\(p_items\)[\s\S]*?left join lateral public\.dp_qb_practice_candidates/,
    );
  });

  it('keeps atomic validation and both queue inserts', () => {
    expect(migration).toContain(
      'Practice session positions and questions must be unique',
    );
    expect(migration).toContain(
      'Practice session positions must be contiguous from zero',
    );
    expect(migration).toContain(
      'Generated practice item is not eligible for its primary block',
    );
    expect(migration).toContain(
      'Every practice item needs its primary block match',
    );
    expect(migration).toContain(
      'insert into public.dp_qb_practice_session_items',
    );
    expect(migration).toContain(
      'insert into public.dp_qb_practice_session_item_matches',
    );
  });

  it('does not weaken the function security model', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).not.toContain('grant execute');
  });
});

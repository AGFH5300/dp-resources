import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function file(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const migration = file(
  'supabase/migrations/20260801212000_question_bank_candidate_payload.sql',
);
const engine = file('lib/question-bank/practice-engine.ts');

describe('Question Bank complete candidate payload', () => {
  it('returns every candidate through one compact PostgREST row', () => {
    expect(migration).toContain(
      'create or replace function public.dp_qb_practice_candidate_payload',
    );
    expect(migration).toContain('returns table(payload jsonb)');
    expect(migration).toContain('jsonb_agg(');
    expect(migration).toContain('jsonb_build_array(');
    expect(migration).toContain(
      'from public.dp_qb_practice_candidates(p_user_id, p_configuration)',
    );
  });

  it('keeps the payload RPC service-role only', () => {
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
  });

  it('uses the complete payload for preview, maximization and generation', () => {
    expect(engine).toContain("client.rpc('dp_qb_practice_candidate_payload'");
    expect(engine).not.toContain("client.rpc('dp_qb_practice_candidates'");
    expect(engine).toContain('const payload =');
    expect(engine).toContain('row.length !== 8');
  });
});

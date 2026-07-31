import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260731183300_question_bank_practice_builder_foundation_hardening.sql',
  ),
  'utf8',
);

describe('Question Bank practice builder foundation hardening', () => {
  it('covers session item foreign keys used by deletion and audit paths', () => {
    expect(migration).toContain(
      'dp_qb_practice_session_items_primary_block_idx',
    );
    expect(migration).toContain('(primary_block_id, session_id)');
    expect(migration).toContain(
      'dp_qb_practice_session_items_question_idx',
    );
    expect(migration).toContain('(question_id, session_id)');
  });

  it('allows member-owned blocks to reference approved concepts only', () => {
    expect(migration).toContain("concept.status = 'approved'");
    expect(migration).toContain(
      'Concept block must reference an approved concept',
    );
    expect(migration).not.toContain("concept.status <> 'archived'");
  });

  it('retains a fixed search path and revokes public execution', () => {
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      'revoke all on function private.dp_qb_validate_practice_set_block()',
    );
  });
});

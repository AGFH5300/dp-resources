import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260801230000_question_bank_session_api_timeout.sql',
  ),
  'utf8',
);

describe('large Question Bank session API timeout', () => {
  it('overrides the PostgREST authenticator timeout for the mutation only', () => {
    expect(migration).toContain(
      'alter function public.dp_qb_create_practice_session(',
    );
    expect(migration).toContain("set statement_timeout = '2min'");
  });

  it('does not change execute privileges or expose the mutation', () => {
    expect(migration).not.toContain('grant execute');
    expect(migration).not.toContain('security invoker');
  });
});

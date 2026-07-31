import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260731102000_fix_taxonomy_prefix_boundary.sql',
  'utf8',
);

describe('Question Bank taxonomy prefix boundary migration', () => {
  it('requires punctuation or whitespace after a taxonomy designator', () => {
    expect(migration).toContain('(?:\\s*[:.)\\]-]\\s*|\\s+)');
    expect(migration).toContain('create or replace function private.dp_qb_canonical_taxonomy_name');
  });

  it('forces stored generated names and keys to be recomputed', () => {
    expect(migration).toContain('alter column canonical_name');
    expect(migration).toContain(
      'set expression as (private.dp_qb_canonical_taxonomy_name(name))',
    );
    expect(migration).toContain('alter column canonical_key');
    expect(migration).toContain(
      'set expression as (private.dp_qb_canonical_taxonomy_key(name))',
    );
  });

  it('fails closed on duplicates, noncanonical labels, or broken provenance', () => {
    expect(migration).toContain('Prefix-boundary repair produced % duplicate topic groups');
    expect(migration).toContain('Prefix-boundary repair produced % duplicate subtopic groups');
    expect(migration).toContain(
      'Topic names are not fully canonical after prefix-boundary repair',
    );
    expect(migration).toContain(
      'Subtopic names are not fully canonical after prefix-boundary repair',
    );
    expect(migration).toContain('Topic provenance mapping failed after prefix-boundary repair');
    expect(migration).toContain(
      'Subtopic provenance mapping failed after prefix-boundary repair',
    );
  });
});

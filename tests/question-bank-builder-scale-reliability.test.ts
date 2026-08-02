import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260802111846_question_bank_builder_scale_reliability.sql',
  'utf8',
);
const select = readFileSync('components/ui/app-select.tsx', 'utf8');
const globals = readFileSync('app/globals.css', 'utf8');

describe('Question Bank builder scale reliability', () => {
  it('loads availability set-wise with a scoped website timeout', () => {
    expect(migration).toContain(
      'create or replace function public.dp_qb_practice_concept_availability',
    );
    expect(migration).toContain("set statement_timeout = '30s'");
    expect(migration).toContain('with mapped_variants as');
    expect(migration).not.toContain(
      'join lateral private.dp_qb_concept_variant_candidates(concept.id)',
    );
  });

  it('supports consolidated concept ids and protects large candidate payloads', () => {
    expect(migration).toContain("item.value -> 'conceptIds'");
    expect(migration).toContain('block_concepts as');
    expect(migration).toContain(
      'alter function public.dp_qb_practice_candidate_payload(uuid, jsonb)',
    );
    expect(migration).toContain('Builder reliability migration changed protected');
  });

  it('keeps select menus collision-aware and viewport-bounded', () => {
    expect(select).toContain('collisionPadding={12}');
    expect(select).not.toContain('avoidCollisions={false}');
    expect(globals).toContain('var(--radix-select-content-available-width)');
    expect(globals).toContain('calc(100vw - 1.5rem)');
  });
});


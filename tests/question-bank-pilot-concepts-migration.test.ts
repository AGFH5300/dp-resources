import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260731190000_question_bank_practice_builder_pilot_concepts.sql',
  ),
  'utf8',
);

describe('Question Bank pilot concept migration', () => {
  it('resolves reviewed mappings by exact subject/course/topic/subtopic selectors', () => {
    expect(migration).toContain('create temporary table _dp_qb_pilot_selectors');
    expect(migration).toContain('topic.canonical_key = selector.topic_key');
    expect(migration).toContain('subtopic.canonical_key = selector.subtopic_key');
    expect(migration).toContain(
      'Every reviewed pilot selector must resolve exactly once',
    );
    expect(migration).toContain(
      "if (select count(*) from _dp_qb_resolved_pilot_selectors) <> 25",
    );
    expect(migration).not.toMatch(/ilike|similar to|levenshtein|word_similarity/i);
  });

  it('creates one reusable candidate resolver for preview and generation', () => {
    expect(migration).toContain(
      'private.dp_qb_concept_variant_candidates',
    );
    expect(migration).toContain("override.action = 'include'");
    expect(migration).toContain("override.action = 'exclude'");
    expect(migration).toContain("variant.render_status = 'ready'");
    expect(migration).toContain(
      'public.dp_qb_practice_concept_availability',
    );
  });

  it('keeps the catalogue member-gated and denies anonymous RPC execution', () => {
    expect(migration).toContain('not private.dp_qb_has_access()');
    expect(migration).toContain(
      'revoke execute on function public.dp_qb_practice_concept_availability()',
    );
    expect(migration).toContain('from public, anon');
    expect(migration).toContain('to authenticated');
  });

  it('approves concepts only after ready-question and cross-subject audits pass', () => {
    const auditPosition = migration.indexOf(
      'Every approved pilot concept must have ready questions',
    );
    const approvalPosition = migration.indexOf("set status = 'approved'");
    expect(auditPosition).toBeGreaterThan(-1);
    expect(approvalPosition).toBeGreaterThan(auditPosition);
    expect(migration).toContain('Cross-subject concept mapping detected');
    expect(migration).toContain('Pilot concept audit failed');
  });
});

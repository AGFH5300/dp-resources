import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260731174800_question_bank_practice_builder_foundation.sql',
  ),
  'utf8',
);

describe('Question Bank practice builder foundation migration', () => {
  it('keeps student-facing concepts separate from imported taxonomy', () => {
    expect(migration).toContain('create table public.dp_qb_concepts');
    expect(migration).toContain(
      'create table public.dp_qb_concept_topic_memberships',
    );
    expect(migration).toContain(
      'create table public.dp_qb_concept_subtopic_memberships',
    );
    expect(migration).toContain(
      'create table public.dp_qb_concept_variant_overrides',
    );
    expect(migration).not.toMatch(/update\s+public\.dp_qb_(questions|question_variants|topics|subtopics)\b/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.dp_qb_/i);
  });

  it('models independent course selection for each concept block', () => {
    expect(migration).toContain(
      'create table public.dp_qb_practice_set_blocks',
    );
    expect(migration).toContain(
      'create table public.dp_qb_practice_set_block_courses',
    );
    expect(migration).toContain(
      "selection_type in ('concept', 'course')",
    );
    expect(migration).toContain(
      'Selected course must match the concept block subject',
    );
    expect(migration).toContain(
      'A concept block can select at most 10 courses',
    );
  });

  it('persists immutable deduplicated session queues', () => {
    expect(migration).toContain(
      'create table public.dp_qb_practice_sessions',
    );
    expect(migration).toContain(
      'create table public.dp_qb_practice_session_items',
    );
    expect(migration).toContain(
      'create table public.dp_qb_practice_session_item_matches',
    );
    expect(migration).toContain('unique (session_id, position)');
    expect(migration).toContain('unique (session_id, question_id)');
    expect(migration).toContain('configuration_snapshot jsonb not null');
    expect(migration).toContain('generation_seed text not null');
    expect(migration).toContain('configuration_hash text not null');
  });

  it('allows browser writes only for owner-controlled configuration rows', () => {
    expect(migration).toContain(
      'grant select, insert, update, delete on public.dp_qb_practice_sets to authenticated',
    );
    expect(migration).toContain(
      'grant select, insert, update, delete on public.dp_qb_practice_set_blocks to authenticated',
    );
    expect(migration).toContain(
      'grant select, insert, update, delete on public.dp_qb_practice_set_block_courses to authenticated',
    );
    expect(migration).toContain(
      'grant select on public.dp_qb_practice_sessions to authenticated',
    );
    expect(migration).not.toContain(
      'grant insert on public.dp_qb_practice_sessions to authenticated',
    );
    expect(migration).not.toContain(
      'grant insert on public.dp_qb_practice_session_items to authenticated',
    );
  });

  it('enables RLS across every new shared and user-owned table', () => {
    const tables = [
      'dp_qb_concept_groups',
      'dp_qb_concepts',
      'dp_qb_concept_topic_memberships',
      'dp_qb_concept_subtopic_memberships',
      'dp_qb_concept_variant_overrides',
      'dp_qb_practice_sets',
      'dp_qb_practice_set_blocks',
      'dp_qb_practice_set_block_courses',
      'dp_qb_practice_sessions',
      'dp_qb_practice_session_items',
      'dp_qb_practice_session_item_matches',
    ];

    for (const table of tables) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });
});

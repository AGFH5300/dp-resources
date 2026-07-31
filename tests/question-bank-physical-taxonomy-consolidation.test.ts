import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260731093000_physical_question_bank_taxonomy_consolidation.sql',
  'utf8',
);

describe('physical Question Bank taxonomy consolidation', () => {
  it('preserves every source taxonomy row in private provenance tables', () => {
    expect(migration).toContain('create table if not exists public.dp_qb_topic_sources');
    expect(migration).toContain('source_topic_id uuid primary key');
    expect(migration).toContain('create table if not exists public.dp_qb_subtopic_sources');
    expect(migration).toContain('source_subtopic_id uuid primary key');
    expect(migration).toContain('insert into public.dp_qb_topic_sources');
    expect(migration).toContain('insert into public.dp_qb_subtopic_sources');
    expect(migration).toContain('revoke all on public.dp_qb_topic_sources from anon, authenticated');
    expect(migration).toContain('revoke all on public.dp_qb_subtopic_sources from anon, authenticated');
  });

  it('remaps all live taxonomy references before deleting redundant rows', () => {
    const variantTopicUpdate = migration.indexOf(
      'update public.dp_qb_question_variants v\nset topic_id',
    );
    const variantSubtopicUpdate = migration.indexOf(
      'set canonical_source_subtopic_id',
    );
    const placementRewrite = migration.indexOf(
      'delete from public.dp_qb_question_subtopics',
    );
    const subtopicDelete = migration.indexOf(
      'delete from public.dp_qb_subtopics s',
    );
    const topicDelete = migration.indexOf('delete from public.dp_qb_topics t');

    expect(variantTopicUpdate).toBeGreaterThan(-1);
    expect(variantSubtopicUpdate).toBeGreaterThan(variantTopicUpdate);
    expect(placementRewrite).toBeGreaterThan(variantSubtopicUpdate);
    expect(subtopicDelete).toBeGreaterThan(placementRewrite);
    expect(topicDelete).toBeGreaterThan(subtopicDelete);
    expect(migration).toContain('bool_and(p.is_fallback)');
    expect(migration).toContain('group by p.variant_id, sm.canonical_subtopic_id');
  });

  it('enforces one physical taxonomy row and transparently canonicalizes future imports', () => {
    expect(migration).toContain(
      'create unique index if not exists dp_qb_topics_course_canonical_key_unique',
    );
    expect(migration).toContain(
      'create unique index if not exists dp_qb_subtopics_topic_canonical_key_unique',
    );
    expect(migration).toContain('private.dp_qb_topics_canonicalize_write()');
    expect(migration).toContain('private.dp_qb_subtopics_canonicalize_write()');
    expect(migration).toContain('private.dp_qb_variants_canonicalize_taxonomy()');
    expect(migration).toContain('private.dp_qb_placements_canonicalize_taxonomy()');
    expect(migration).toContain('before insert or update of topic_id, canonical_source_subtopic_id');
    expect(migration).toContain('before insert or update of subtopic_id');
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
  });

  it('fails the migration if consolidation leaves duplicates or broken references', () => {
    expect(migration).toContain("raise exception 'Taxonomy consolidation left % duplicate topic groups'");
    expect(migration).toContain("raise exception 'Taxonomy consolidation left % duplicate subtopic groups'");
    expect(migration).toContain("raise exception 'Variant/topic course mismatch after taxonomy consolidation'");
    expect(migration).toContain(
      "raise exception 'Placement/subtopic course mismatch after taxonomy consolidation'",
    );
    expect(migration).toContain('if variant_count <> search_count then');
  });
});

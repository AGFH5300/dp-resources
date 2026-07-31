import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dataMigration = readFileSync(
  'supabase/migrations/20260731110000_question_bank_multi_topic_data.sql',
  'utf8',
);
const runtimeMigration = readFileSync(
  'supabase/migrations/20260731110100_question_bank_multi_topic_runtime.sql',
  'utf8',
);
const verificationMigration = readFileSync(
  'supabase/migrations/20260731110200_question_bank_import_verification_view.sql',
  'utf8',
);
const importer = readFileSync('scripts/question-bank/import.mjs', 'utf8');

describe('Question Bank multi-topic physical taxonomy', () => {
  it('models source and variant topic membership without physical composites', () => {
    expect(dataMigration).toContain(
      'create table public.dp_qb_topic_source_memberships',
    );
    expect(dataMigration).toContain('create table public.dp_qb_variant_topics');
    expect(dataMigration).toContain(
      'create table public.dp_qb_subtopic_source_topic_memberships',
    );
    expect(dataMigration).toContain(
      'create table public.dp_qb_variant_topic_only_sources',
    );
    expect(dataMigration).toContain(
      'delete from public.dp_qb_topics topic\nusing _dp_qb_composite_physical_topics',
    );
    expect(dataMigration).toContain(
      'delete from public.dp_qb_subtopics subtopic\nusing _dp_qb_composite_source_subtopics',
    );
    expect(dataMigration).toContain(
      'expected_composite_sources bigint := 479',
    );
    expect(dataMigration).toContain(
      'expected_topic_only_placements bigint := 914',
    );
  });

  it('keeps all source aliases private and fails closed on any lost relationship', () => {
    expect(dataMigration).toContain(
      'alter table public.dp_qb_variant_topics enable row level security',
    );
    expect(dataMigration).toContain(
      'revoke all on public.dp_qb_variant_topics',
    );
    expect(dataMigration).toContain('A protected Question Bank count changed');
    expect(dataMigration).toContain('A variant has no topic membership');
    expect(dataMigration).toContain(
      'A source topic primary membership differs from topic_id',
    );
    expect(dataMigration).toContain(
      'A resolvable composite physical topic remains',
    );
    expect(dataMigration).toContain(
      'A physical taxonomy label is not canonical',
    );
  });

  it('prevents every existing importer from recreating composite rows', () => {
    expect(runtimeMigration).toContain(
      'private.dp_qb_source_topic_components',
    );
    expect(runtimeMigration).toContain('if component_count > 1 then');
    expect(runtimeMigration).toContain('return null;');
    expect(runtimeMigration).toContain(
      'private.dp_qb_sync_variant_topics',
    );
    expect(runtimeMigration).toContain(
      'private.dp_qb_variant_topic_names',
    );
    expect(runtimeMigration).toContain(
      'public.dp_qb_variant_topic_only_sources',
    );
    expect(runtimeMigration).toContain(
      'before insert or update of\n  topic_id,\n  canonical_source_subtopic_id,\n  source_topic_id',
    );
  });

  it('filters through all memberships while retaining one primary topic ID', () => {
    expect(runtimeMigration).toContain(
      'from public.dp_qb_variant_topics membership',
    );
    expect(runtimeMigration).toContain(
      'membership.topic_id = p_topic_id',
    );
    expect(runtimeMigration).toContain(
      'private.dp_qb_variant_topic_names(variant.id) as topic_name',
    );
    expect(runtimeMigration).toContain(
      'revoke execute on function public.dp_qb_list_questions',
    );
    expect(runtimeMigration).toContain(
      'revoke execute on function public.dp_qb_search_questions',
    );
  });

  it('verifies source taxonomy and logical placements instead of physical duplicates', () => {
    expect(verificationMigration).toContain(
      'create or replace view public.dp_qb_import_placement_sources',
    );
    expect(verificationMigration).toContain(
      'public.dp_qb_variant_topic_only_sources',
    );
    expect(verificationMigration).toContain(
      'revoke all on public.dp_qb_import_placement_sources',
    );
    expect(importer).toContain("topics: 'dp_qb_topic_sources'");
    expect(importer).toContain("subtopics: 'dp_qb_subtopic_sources'");
    expect(importer).toContain(
      "table: 'dp_qb_import_placement_sources'",
    );
    expect(importer).toContain(
      "'dp_qb_topic_sources',\n      'topics',",
    );
    expect(importer).toContain(
      "'dp_qb_subtopic_sources',\n      'subtopics',",
    );
  });
});

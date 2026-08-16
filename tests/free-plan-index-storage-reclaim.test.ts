import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migrationPath =
  'supabase/migrations/20260816141000_free_plan_index_storage_reclaim.sql';
const migration = readFileSync(migrationPath, 'utf8');

function droppedIndexes(sql: string) {
  return Array.from(
    sql.matchAll(/drop index if exists public\.([a-z0-9_]+);/g),
    (match) => match[1],
  );
}

describe('Free plan index storage reclaim', () => {
  it('drops only the audited non-constraint or exact-duplicate indexes', () => {
    expect(droppedIndexes(migration)).toEqual([
      'dp_qb_placements_browse_idx',
      'dp_qb_asset_sources_file_idx',
      'dp_resource_index_normalized_name_idx',
      'dp_resource_index_path_idx',
      'dp_resource_source_assignments_parent_idx',
      'dp_qb_asset_optimizations_hash_idx',
      'dp_resource_activity_user_date_idx',
      'dp_resource_memberships_email_idx',
    ]);
  });

  it('keeps critical search, uniqueness and runtime access indexes', () => {
    const protectedIndexes = [
      'dp_qb_questions_search_idx',
      'dp_resource_index_search_idx',
      'dp_qb_questions_content_hash_unique_idx',
      'dp_qb_assets_content_hash_key',
      'dp_qb_assets_storage_provider_storage_bucket_storage_key_key',
      'dp_qb_asset_sources_source_key_key',
      'dp_qb_asset_sources_asset_idx',
      'dp_qb_question_subtopics_pkey',
      'dp_qb_question_subtopics_subtopic_variant_idx',
      'dp_resource_index_drive_file_id_key',
      'dp_resource_index_parent_drive_file_id_idx',
      'dp_resource_source_assignment_identity_uidx',
      'dp_resource_source_assignments_file_idx',
      'dp_resource_source_assignments_source_idx',
      'dp_activity_user_created_idx',
      'dp_memberships_lower_email_idx',
    ];

    for (const index of protectedIndexes) {
      expect(migration).not.toContain(`drop index if exists public.${index};`);
    }
  });

  it('does not delete, truncate, rewrite or vacuum application data', () => {
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
    expect(migration).not.toMatch(/\binsert\s+into\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bvacuum\s+full\b/i);
  });

  it('rebuilds only the audited practice-share table indexes', () => {
    expect(migration).toContain(
      'reindex table public.dp_qb_practice_share_items;',
    );
    expect((migration.match(/\breindex\s+table\b/gi) || []).length).toBe(1);
  });

  it('uses bounded lock and statement timeouts', () => {
    expect(migration).toContain("set lock_timeout = '5s';");
    expect(migration).toContain("set statement_timeout = '120s';");
  });
});

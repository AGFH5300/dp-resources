import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const cleanupMigration =
  'supabase/migrations/20260805132615_free_plan_database_cleanup.sql';

describe('Question Bank Free Plan database cleanup', () => {
  it('removes duplicated search storage without changing importer writes', () => {
    const migration = read(cleanupMigration);
    const recreatedSearchTable = migration.slice(
      migration.indexOf('create table public.dp_qb_question_search'),
      migration.indexOf(
        'create or replace function private.dp_qb_compact_importer_search_document',
      ),
    );

    expect(migration).toContain('drop table public.dp_qb_question_search;');
    expect(recreatedSearchTable).toContain('search_text text not null');
    expect(recreatedSearchTable).not.toContain('search_vector');
    expect(migration).toContain("new.search_text := '';");
    expect(migration).toContain("to_tsvector(\n          'simple'");
    expect(migration).not.toContain('join public.dp_qb_question_search');
    expect(migration).toContain(
      'drop index if exists public.dp_qb_questions_content_hash_idx;',
    );
  });

  it('keeps the guarded legacy cleanup available for old deployments', () => {
    const migration = read(cleanupMigration);
    const cleanup = read(
      'lib/question-bank/practice-session-cleanup.ts',
    );

    expect(migration).toContain('session.user_id = p_user_id');
    expect(migration).toContain("session.status = 'building'");
    expect(migration).toContain('session.id = p_session_id');
    expect(migration).toContain('session.updated_at < now() - make_interval');
    expect(cleanup).toContain("'dp_qb_cleanup_abandoned_practice_sessions'");
    expect(cleanup).toContain("'dp_qb_delete_abandoned_practice_session'");
  });

  it('does not create ordinary practice-session rows in production', () => {
    const route = read(
      'app/api/question-bank/practice-builder/sessions/route.ts',
    );
    const client = read('lib/question-bank/practice-api-client.ts');
    const localStorage = read(
      'lib/question-bank/local-practice-session-storage.ts',
    );

    expect(route).toContain("type: 'session'");
    expect(route).toContain("type: 'chunk'");
    expect(route).toContain('practiceSessionItems(prepared, generationSeed)');
    expect(route).not.toContain('beginPracticeSessionBuild');
    expect(route).not.toContain('appendPracticeSessionBuildBatch');
    expect(route).not.toContain('dp_qb_practice_sessions');
    expect(client).toContain('browserPracticeSink');
    expect(client).toContain('beginLocalPracticeSession');
    expect(client).toContain('appendLocalPracticeQueueChunk');
    expect(localStorage).toContain("const DATABASE_NAME = 'dp-resources-question-bank-local'");
  });
});

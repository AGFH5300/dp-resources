import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Question Bank Free Plan database cleanup', () => {
  it('removes duplicated search storage without changing importer writes', () => {
    const migration = read(
      'supabase/migrations/20260805131000_free_plan_database_cleanup.sql',
    );
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
    expect(migration).toContain('dp_qb_questions_search_idx');
    expect(migration).not.toContain('join public.dp_qb_question_search');
    expect(migration).toContain(
      'drop index if exists public.dp_qb_questions_content_hash_idx;',
    );
  });

  it('deletes only the owning user’s interrupted builds', () => {
    const migration = read(
      'supabase/migrations/20260805131000_free_plan_database_cleanup.sql',
    );
    const cleanup = read(
      'lib/question-bank/practice-session-cleanup.ts',
    );

    expect(migration).toContain('session.user_id = p_user_id');
    expect(migration).toContain("session.status = 'building'");
    expect(migration).toContain('session.id = p_session_id');
    expect(migration).toContain('session.updated_at < now() - make_interval');
    expect(migration).toContain('before insert on public.dp_qb_practice_sessions');
    expect(cleanup).toContain("'dp_qb_cleanup_abandoned_practice_sessions'");
    expect(cleanup).toContain("'dp_qb_delete_abandoned_practice_session'");
    expect(cleanup).toContain('p_user_id: userId');
    expect(cleanup).toContain('p_session_id: sessionId');
  });

  it('cleans failed, cancelled, refreshed and stale practice builds', () => {
    const route = read(
      'app/api/question-bank/practice-builder/sessions/route.ts',
    );
    const page = read('app/question-bank/build/page.tsx');

    expect(route).toContain('cleanupAbandonedPracticeSessions');
    expect(route).toContain('deleteAbandonedPracticeSession');
    expect(route).toContain("removeActiveBuild('session creation failed')");
    expect(route).toContain(
      "removeActiveBuild('client cancelled the response stream')",
    );
    expect(route).toContain(
      "removeActiveBuild('client disconnected during session creation')",
    );
    expect(route).not.toContain('Your saved progress can be retried.');
    expect(page).toContain('cleanupAbandonedPracticeSessions');
    expect(page).toContain('Unable to clean stale Question Bank practice sessions.');
  });
});

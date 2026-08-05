import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('browser-local Question Bank practice sessions', () => {
  it('stores ordinary queues in IndexedDB with bounded retention', () => {
    const storage = read(
      'lib/question-bank/local-practice-session-storage.ts',
    );

    expect(storage).toContain("const SESSION_STORE = 'practiceSessions'");
    expect(storage).toContain("const QUEUE_STORE = 'practiceQueueChunks'");
    expect(storage).toContain('navigator.storage?.persist?.()');
    expect(storage).toContain('navigator.storage?.estimate?.()');
    expect(storage).toContain('const MAX_SESSIONS_PER_USER = 8');
    expect(storage).toContain('const IN_PROGRESS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000');
    expect(storage).toContain('discardLocalPracticeSession');
    expect(storage).toContain('cleanupLocalPracticeSessions');
  });

  it('hydrates only the requested local page from canonical server data', () => {
    const page = read(
      'components/question-bank/local-practice-session-page.tsx',
    );
    const route = read(
      'app/api/question-bank/practice-builder/local-session-page/route.ts',
    );
    const serverPage = read(
      'app/question-bank/practice/[sessionId]/page.tsx',
    );

    expect(page).toContain('getLocalPracticeSessionPage');
    expect(page).toContain('/api/question-bank/practice-builder/local-session-page');
    expect(page).toContain('Stored on this device');
    expect(page).toContain('Delete from device');
    expect(route).toContain('const MAX_PAGE_ITEMS = 100');
    expect(route).toContain(".from('dp_qb_question_variants')");
    expect(route).toContain(".from('dp_qb_user_progress')");
    expect(route).toContain(".from('dp_qb_user_saved_questions')");
    expect(serverPage).toContain('LocalPracticeSessionPage');
    expect(serverPage).not.toContain('getPracticeSession');
  });

  it('persists an exact queue only after an explicit share action', () => {
    const dialog = read(
      'components/question-bank/practice-share-dialog.tsx',
    );
    const uploadRoute = read(
      'app/api/question-bank/practice-shares/[code]/queue/route.ts',
    );
    const migration = read(
      'supabase/migrations/20260805142500_local_practice_share_upload.sql',
    );
    const exactRoute = read(
      'app/api/question-bank/practice-shares/[code]/exact-session/route.ts',
    );

    expect(dialog).toContain('readLocalPracticeQueueChunks');
    expect(dialog).toContain('Save exact queue and create code');
    expect(dialog).toContain("method: 'PATCH'");
    expect(dialog).toContain("method: 'DELETE'");
    expect(uploadRoute).toContain('dp_qb_append_local_practice_share_chunk');
    expect(uploadRoute).toContain('dp_qb_finalize_local_practice_share_queue');
    expect(migration).toContain('share.owner_id = p_user_id');
    expect(migration).toContain('not share.has_exact_queue');
    expect(migration).toContain('Practice share chunks must be uploaded in order');
    expect(exactRoute).toContain("type: 'chunk'");
    expect(exactRoute).not.toContain('cloneExactPracticeShare');
  });
});

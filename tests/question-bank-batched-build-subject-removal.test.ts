import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read(
  'supabase/migrations/20260803184136_batched_practice_build_and_subject_removal.sql',
);
const cleanupMigration = read(
  'supabase/migrations/20260803184732_drop_retired_question_bank_asset_queue.sql',
);
const route = read(
  'app/api/question-bank/practice-builder/sessions/route.ts',
);
const engine = read('lib/question-bank/practice-engine.ts');
const client = read('lib/question-bank/practice-api-client.ts');
const builder = read('components/question-bank/practice-set-builder-v4.tsx');
const styles = read(
  'components/question-bank/practice-set-builder-v2.module.css',
);
const revisionVillage = read('scripts/question-bank/revision-village.mjs');
const examMate = read('scripts/question-bank/exam-mate.mjs');

describe('batched Question Bank practice builds and retired subjects', () => {
  it('writes large queues through bounded, idempotent, service-only batches', () => {
    expect(migration).toContain('public.dp_qb_practice_session_builds');
    expect(migration).toContain('client_request_id');
    expect(migration).toContain("status in ('building', 'complete')");
    expect(migration).toContain('public.dp_qb_begin_practice_session_build');
    expect(migration).toContain('public.dp_qb_append_practice_session_batch');
    expect(migration).toContain('item_count > 400');
    expect(migration).toContain('for update');
    expect(migration).toContain('Practice session batch does not match committed progress');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
    expect(engine).toContain('PRACTICE_SESSION_BUILD_BATCH_SIZE = 400');
    expect(engine).toContain("client.rpc('dp_qb_append_practice_session_batch'");
  });

  it('streams committed progress and renders a compact accessible bar', () => {
    expect(route).toContain("'Content-Type': 'application/x-ndjson; charset=utf-8'");
    expect(route).toContain("type: 'progress'");
    expect(route).toContain("send({ type: 'progress', ...state })");
    expect(route).toContain('for (let attempt = 0; attempt < 4; attempt += 1)');
    expect(client).toContain('readPracticeBuildStream');
    expect(builder).toContain('Practice session preparation progress');
    expect(builder).toContain('questions saved');
    expect(builder).not.toContain('fixed inset-0 z-[150]');
    expect(styles).toContain('.buildProgressPanel');
    expect(styles).toContain('.buildProgressBar');
  });

  it('removes all three subjects and queues only orphaned R2 objects', () => {
    for (const subject of ['english-b', 'philosophy', 'world-religions'])
      expect(migration).toContain(subject);
    expect(migration).toContain('public.dp_qb_asset_deletion_queue');
    expect(migration).toContain('not exists (');
    expect(migration).toContain('delete from public.dp_qb_practice_sessions');
    expect(migration).toContain('delete from public.dp_qb_questions');
    expect(migration).toContain('delete from public.dp_qb_assets');
    expect(migration).toContain('delete from public.dp_qb_subjects');
    expect(migration).toContain('drop table if exists public.dp_qb_exam_mate_import_stage');
    expect(cleanupMigration).toContain(
      '(select count(*) from public.dp_qb_asset_deletion_queue) <> 1034',
    );
    expect(cleanupMigration).toContain(
      'drop table public.dp_qb_asset_deletion_queue',
    );
    expect(revisionVillage).toContain(
      'isRetiredRevisionVillageSubjectGroup(placement.subjectGroup)',
    );
    expect(revisionVillage).toContain('retainedAssetManifest');
    expect(examMate.indexOf('isRetiredExamMateSubject(question.subject)')).toBeLessThan(
      examMate.indexOf('const reasons = [];'),
    );
  });
});

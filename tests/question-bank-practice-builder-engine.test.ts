import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function file(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const migration = file(
  'supabase/migrations/20260731193000_question_bank_practice_builder_engine.sql',
);
const previewRoute = file(
  'app/api/question-bank/practice-builder/preview/route.ts',
);
const sessionRoute = file(
  'app/api/question-bank/practice-builder/sessions/route.ts',
);
const sessionStateRoute = file(
  'app/api/question-bank/practice-builder/sessions/[sessionId]/state/route.ts',
);
const landing = file('app/question-bank/page.tsx');
const builderPage = file('app/question-bank/build/page.tsx');
const sessionPage = file('app/question-bank/practice/[sessionId]/page.tsx');

describe('Question Bank practice builder engine', () => {
  it('uses one database candidate function for preview and generation', () => {
    expect(migration).toContain('public.dp_qb_practice_candidates');
    expect(migration).toContain(
      'Generated practice item is not eligible for its primary block',
    );
    expect(migration).toContain(
      'public.dp_qb_create_practice_session',
    );
    expect(migration).toContain('configuration_snapshot');
    expect(migration).toContain('generation_seed');
    expect(migration).toContain('configuration_hash');
  });

  it('keeps candidate and session writes service-role only', () => {
    expect(migration).toContain(
      'from public, anon, authenticated',
    );
    expect(migration).toContain('to service_role');
    expect(migration).not.toContain(
      'grant execute on function public.dp_qb_create_practice_session',
    );
  });

  it('validates fixed session positions, eligibility and primary matches atomically', () => {
    expect(migration).toContain(
      'Practice session positions must be contiguous from zero',
    );
    expect(migration).toContain(
      'Every practice item needs its primary block match',
    );
    expect(migration).toContain('unique question');
    expect(migration).toContain(
      'insert into public.dp_qb_practice_session_items',
    );
    expect(migration).toContain(
      'insert into public.dp_qb_practice_session_item_matches',
    );
  });

  it('protects every write API with membership, same-origin and input validation', () => {
    for (const route of [previewRoute, sessionRoute, sessionStateRoute]) {
      expect(route).toContain('sameOriginOrForbidden');
      expect(route).toContain('requireMember');
      expect(route).toContain('no-store');
    }
    expect(previewRoute).toContain('parsePracticeConfiguration');
    expect(sessionRoute).toContain('PracticeConfigurationShortageError');
    expect(sessionStateRoute).toContain('updatePracticeSessionItem');
  });

  it('adds the two public entry points and persistent custom session route', () => {
    expect(landing).toContain('Practise a course');
    expect(landing).toContain('Build a practice set');
    expect(landing).toContain('href="/question-bank/build"');
    expect(builderPage).toContain('PracticeSetBuilder');
    expect(sessionPage).toContain('CoursePracticeWorkspace');
    expect(sessionPage).toContain('PracticeSessionTracker');
  });
});

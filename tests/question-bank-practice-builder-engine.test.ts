import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function file(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const originalMigration = file(
  'supabase/migrations/20260731193000_question_bank_practice_builder_engine.sql',
);
const sharingMigration = file(
  'supabase/migrations/20260801170000_question_bank_share_codes_and_large_sessions.sql',
);
const candidateMigration = file(
  'supabase/migrations/20260801170500_question_bank_large_candidate_sets.sql',
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
const shareRoute = file('app/api/question-bank/practice-shares/route.ts');
const exactShareRoute = file(
  'app/api/question-bank/practice-shares/[code]/exact-session/route.ts',
);
const landing = file('app/question-bank/page.tsx');
const builderPage = file('app/question-bank/build/page.tsx');
const joinPage = file('app/question-bank/join/[code]/page.tsx');
const sessionPage = file('app/question-bank/practice/[sessionId]/page.tsx');

describe('Question Bank practice builder engine', () => {
  it('uses one database candidate function for preview and generation', () => {
    expect(originalMigration).toContain('public.dp_qb_practice_candidates');
    expect(sharingMigration).toContain(
      'Generated practice item is not eligible for its primary block',
    );
    expect(sharingMigration).toContain(
      'public.dp_qb_create_practice_session',
    );
    expect(sharingMigration).toContain('configuration_snapshot');
    expect(sharingMigration).toContain('generation_seed');
    expect(sharingMigration).toContain('configuration_hash');
  });

  it('keeps candidate, session and share mutation functions service-role only', () => {
    for (const migration of [sharingMigration, candidateMigration]) {
      expect(migration).toContain('from public, anon, authenticated');
      expect(migration).toContain('to service_role');
    }
    expect(sharingMigration).not.toMatch(
      /grant execute on function public\.dp_qb_(?:create_practice_session|create_practice_share|clone_practice_share)[\s\S]*?to authenticated/,
    );
    expect(candidateMigration).not.toMatch(
      /grant execute on function public\.dp_qb_practice_candidates[\s\S]*?to authenticated/,
    );
  });

  it('validates fixed session positions, eligibility and primary matches atomically', () => {
    expect(sharingMigration).toContain(
      'Practice session positions must be contiguous from zero',
    );
    expect(sharingMigration).toContain(
      'Every practice item needs its primary block match',
    );
    expect(sharingMigration).toContain(
      'Practice session positions and questions must be unique',
    );
    expect(sharingMigration).toContain(
      'insert into public.dp_qb_practice_session_items',
    );
    expect(sharingMigration).toContain(
      'insert into public.dp_qb_practice_session_item_matches',
    );
  });

  it('implements permanent codes without owner expiry, disable or use controls', () => {
    expect(sharingMigration).toContain('create table public.dp_qb_practice_shares');
    expect(sharingMigration).toContain('creator_username');
    expect(sharingMigration).toContain('creator_display_name');
    expect(sharingMigration).toContain('dp_qb_generate_practice_share_code');
    expect(sharingMigration).toContain('dp_qb_clone_practice_share_exact_queue');
    expect(sharingMigration).not.toMatch(/expires_at|is_disabled|max_uses|use_count/);
  });

  it('removes the first-release 200-question and 20-block database guards', () => {
    expect(sharingMigration).toContain(
      'drop constraint if exists dp_qb_practice_sessions_requested_count_check',
    );
    expect(sharingMigration).not.toContain('item_count > 200');
    expect(candidateMigration).not.toContain(
      "jsonb_array_length(p_configuration -> 'blocks') > 20",
    );
  });

  it('protects every write API with membership and same-origin validation', () => {
    for (const route of [
      previewRoute,
      sessionRoute,
      sessionStateRoute,
      shareRoute,
      exactShareRoute,
    ]) {
      expect(route).toContain('sameOriginOrForbidden');
      expect(route).toContain('requireMember');
      expect(route).toContain('no-store');
    }
    expect(previewRoute).toContain('parsePracticeConfiguration');
    expect(sessionRoute).toContain('PracticeConfigurationShortageError');
    expect(sessionStateRoute).toContain('updatePracticeSessionItem');
  });

  it('adds course, builder and join-by-code entry points', () => {
    expect(landing).toContain('Practise a course');
    expect(landing).toContain('Build a practice set');
    expect(landing).toContain('Join with a code');
    expect(landing).toContain('href="/question-bank/join"');
    expect(builderPage).toContain('PracticeSetBuilderV3');
    expect(joinPage).toContain('Use the creator\'s exact queue');
    expect(joinPage).toContain('Fully customize');
    expect(sessionPage).toContain('CoursePracticeWorkspace');
    expect(sessionPage).toContain('PracticeSessionTracker');
    expect(sessionPage).toContain('Share this session');
  });
});

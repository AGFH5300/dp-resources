import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Question Bank practice builder production readiness', () => {
  it('uses the final dark-safe builder with bulk and maximum controls', () => {
    const page = read('app/question-bank/build/page.tsx');
    const builder = read(
      'components/question-bank/practice-set-builder-v4.tsx',
    );
    const styles = read(
      'components/question-bank/practice-set-builder-v2.module.css',
    );

    expect(page).toContain('<PracticeSetBuilderV4');
    expect(page).not.toContain('200-question product limit');
    expect(builder).toContain("import { AppSelect } from '@/components/ui/app-select'");
    expect(builder).toContain('<AppSelect');
    expect(builder).not.toContain('<select');
    expect(builder).not.toContain('Sparkles');
    expect(builder).not.toContain('type="number"');
    expect(builder).toContain('+{increment}');
    expect(builder).toContain('Maximum {maximum.toLocaleString()}');
    expect(builder).toContain('Select all topics');
    expect(builder).toContain('Max all');
    expect(builder).toContain('Clear all');
    expect(builder).toContain("'/api/question-bank/practice-builder/maximize'");
    expect(builder).toContain('xl:h-[calc(100dvh-7.5rem)]');
    expect(builder).toContain('appearance="summary"');
    expect(builder).not.toContain('SESSION_MAXIMUM');
    expect(builder).not.toContain('BLOCK_MAXIMUM');
    expect(styles).toContain(":global(html[data-theme='dark']) .conceptButton");
    expect(styles).toContain('.conceptButtonSelected:disabled');
    expect(styles).toContain('.deleteButton:hover');
  });

  it('does not monkey-patch history or observe every attribute mutation', () => {
    const tracker = read(
      'components/question-bank/practice-session-tracker.tsx',
    );
    const fullscreen = read(
      'components/question-bank/question-practice-fullscreen-control.tsx',
    );

    expect(tracker).not.toContain('window.history.replaceState =');
    expect(tracker).toContain('window.setInterval(record, 400)');
    expect(fullscreen).toContain('observer.observe(document.body');
    expect(fullscreen).toContain('childList: true');
    expect(fullscreen).not.toContain('attributes: true');
    expect(fullscreen).toContain('paneRef.current !== nextPane');
    expect(fullscreen).toContain('toolbarRef.current !== nextToolbar');
    expect(fullscreen).toContain('pane.requestFullscreen');
  });

  it('cleans polluted source topics and optimizes representative candidates', () => {
    const migration = read(
      'supabase/migrations/20260801193000_question_bank_builder_catalog_and_preview_hardening.sql',
    );

    expect(migration).toContain('composite_concepts');
    expect(migration).toContain("'all questions'");
    expect(migration).toContain("'database'");
    expect(migration).toContain("concept.status = 'archived'");
    expect(migration).toContain('row_number() over');
    expect(migration).toContain('partition by filtered.block_key, filtered.question_id');
    expect(migration).toContain('ranked.representative_rank = 1');
    expect(migration).toContain('dp_qb_variants_practice_ready_course_question_idx');
    expect(migration).not.toContain('asset.verification_status');
  });

  it('validates join codes before navigation and displays invalid codes in-app', () => {
    const entry = read('components/question-bank/practice-code-entry.tsx');
    const joinModal = read('app/question-bank/join/page.tsx');
    const sharedPage = read('app/question-bank/join/[code]/page.tsx');
    const validationRoute = read(
      'app/api/question-bank/practice-shares/[code]/route.ts',
    );

    expect(entry).toContain('Opening…');
    expect(entry).toContain('/api/question-bank/practice-shares/');
    expect(entry).toContain('That practice-set code is invalid.');
    expect(joinModal).toContain('role="dialog"');
    expect(joinModal).toContain('aria-modal="true"');
    expect(sharedPage).toContain('Invalid practice-set code');
    expect(sharedPage).not.toContain('notFound()');
    expect(validationRoute).toContain('getPracticeShare');
    expect(validationRoute).toContain('valid: false');
  });

  it('paginates fixed queues instead of loading every shared question at once', () => {
    const queries = read('lib/question-bank/practice-session-queries.ts');
    const sessionPage = read(
      'app/question-bank/practice/[sessionId]/page.tsx',
    );

    expect(queries).toContain('PRACTICE_SESSION_PAGE_SIZE = 50');
    expect(queries).toContain('.range(offset, Math.max(offset, lastPosition))');
    expect(sessionPage).toContain('Queue page');
    expect(sessionPage).toContain('only this page of the fixed queue is');
  });
});

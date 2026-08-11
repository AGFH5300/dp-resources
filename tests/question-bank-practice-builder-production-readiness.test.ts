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
    expect(builder).toContain('Select all subtopics');
    expect(builder).toContain('Max all');
    expect(builder).toContain('Clear all');
    expect(builder).toContain('Add subjects or subtopics');
    expect(builder).toContain('Save content selection');
    expect(builder).toContain('Changes are applied only when you save.');
    expect(builder).not.toContain('1 · Add content');
    expect(builder).toContain('1 · Configure selections');
    expect(builder).toContain('2 · Session settings');
    expect(builder).toContain("'/api/question-bank/practice-builder/maximize'");
    expect(builder).toContain(
      'xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden',
    );
    expect(builder).toContain(
      'styles.selectionViewport} xl:flex xl:min-h-0 xl:flex-1 xl:flex-col',
    );
    expect(styles).not.toContain('height: calc(100dvh - 9.5rem)');
    expect(builder).toContain('ref={rightColumnRef} className="space-y-4"');
    expect(builder).not.toContain('xl:min-h-[calc(100dvh-7.5rem)]');
    expect(builder).not.toContain('xl:min-h-[28rem] xl:flex-1');
    expect(builder).toContain('xl:grid-cols-[minmax(0,1fr)_380px]');
    expect(builder).toContain('xl:items-start');
    expect(builder).not.toContain('xl:items-stretch');
    expect(builder).toContain("window.matchMedia('(min-width: 1280px)')");
    expect(builder).toContain('new ResizeObserver(updateHeight)');
    expect(builder).toContain('{ height: `${desktopSelectionHeight}px` }');
    expect(builder).toContain('appearance="summary"');
    expect(builder).toContain('catalog.subjects.find');
    expect(builder).toContain('selectStagedSubject(fullSubject)');
    expect(builder).toContain('clearStagedSubject(fullSubject)');
    expect(builder).toContain('removeSelectedSubject(subjectGroup.subjectId)');
    expect(builder).toContain('aria-label={`Remove ${subjectGroup.subjectName}`}');
    expect(builder).toContain('toggleStagedConcept(concept.id)');
    expect(builder).toContain('setBlocks([...keptBlocks, ...additions])');
    expect(builder).toContain('aria-labelledby="practice-content-picker-title"');
    expect(builder).toContain('courses selected');
    expect(builder).toContain('eligible questions selected');
    expect(builder).toContain('subjectPreview.totalUniqueAvailable');
    expect(builder).not.toContain('subjectEligible');
    expect(builder).toContain('Course choices');
    expect(builder).toContain('aria-label="Expand session settings"');
    expect(builder).toContain('Every filter and ordering option is visible here.');
    expect(builder).toContain('Find among ${blocks.length.toLocaleString()} selected subtopics');
    expect(builder).toContain('filteredBlockGroups.map');
    expect(builder).toContain('Rotate between subtopics');
    expect(builder).toContain('Shuffle all questions');
    expect(builder).toContain('Finish one subtopic at a time');
    expect(builder).toContain('Original source order');
    expect(builder).toContain('readPracticeApiJson');
    expect(builder).not.toContain('await response.json()');
    expect(builder).not.toContain('SESSION_MAXIMUM');
    expect(builder).not.toContain('BLOCK_MAXIMUM');
    expect(styles).toContain(":global(html[data-theme='dark']) .conceptButton");
    expect(styles).toContain('.conceptButtonSelected:disabled');
    expect(styles).toContain('.deleteButton:hover');
    expect(styles).toContain('.expandedSettingsGrid');
    expect(styles).toContain('.primaryAction');
    expect(styles).toContain('.courseCountPill');
    expect(styles).toContain('.questionCountPill');
  }, 30_000);

  it('keeps practice APIs out of request-mutating middleware and returns JSON auth failures', () => {
    const middleware = read('middleware.ts');
    const auth = read('lib/auth.ts');
    const routes = [
      'app/api/question-bank/practice-builder/preview/route.ts',
      'app/api/question-bank/practice-builder/maximize/route.ts',
      'app/api/question-bank/practice-builder/sessions/route.ts',
      'app/api/question-bank/practice-shares/route.ts',
    ].map(read);

    expect(middleware).toContain(
      "pathname.startsWith('/api/question-bank/practice-builder/')",
    );
    expect(middleware).toContain(
      "pathname.startsWith('/api/question-bank/practice-shares/')",
    );
    expect(auth).toContain('export async function requireApiMember()');
    expect(auth).toContain("'Cache-Control', 'private, no-store, max-age=0'");
    for (const route of routes) {
      expect(route).toContain('requireApiMember');
      expect(route).not.toContain('requireMember');
    }
  });

  it('does not monkey-patch history or observe every attribute mutation', () => {
    const legacyTracker = read(
      'components/question-bank/practice-session-tracker.tsx',
    );
    const localTracker = read(
      'components/question-bank/local-practice-session-tracker.tsx',
    );
    const fullscreen = read(
      'components/question-bank/question-practice-fullscreen-control.tsx',
    );

    expect(legacyTracker).not.toContain('window.history.replaceState =');
    expect(localTracker).not.toContain('window.history.replaceState =');
    expect(localTracker).toContain('window.setInterval(record, 400)');
    expect(fullscreen).toContain('observer.observe(document.body');
    expect(fullscreen).toContain('childList: true');
    expect(fullscreen).not.toContain('attributes: true');
    expect(fullscreen).toContain('layoutRef.current !== layout');
    expect(fullscreen).toContain('toolbarRef.current !== nextToolbar');
    expect(fullscreen).not.toContain('requestFullscreen');
    expect(fullscreen).toContain('Show question full width');
  });

  it('cleans polluted source topics and optimizes representative candidates', () => {
    const migration = read(
      'supabase/migrations/20260801193000_question_bank_builder_catalog_and_preview_hardening.sql',
    );

    expect(migration).toContain('composite_concepts');
    expect(migration).toContain("'all questions'");
    expect(migration).toContain("'database'");
    expect(migration).toContain("set status = 'archived'");
    expect(migration).toContain('row_number() over');
    expect(migration).toContain('partition by filtered.block_key, filtered.question_id');
    expect(migration).toContain('ranked.representative_rank = 1');
    expect(migration).toContain('dp_qb_variants_practice_ready_course_question_idx');
    expect(migration).not.toContain('asset.verification_status');
  });

  it('validates join codes before navigation and displays invalid codes in-app', () => {
    const entry = read('components/question-bank/practice-code-entry.tsx');
    const joinModal = read(
      'components/question-bank/question-bank-join-modal.tsx',
    );
    const joinRoute = read('app/question-bank/join/page.tsx');
    const sharedPage = read('app/question-bank/join/[code]/page.tsx');
    const validationRoute = read(
      'app/api/question-bank/practice-shares/[code]/route.ts',
    );

    expect(entry).toContain('Opening…');
    expect(entry).toContain('/api/question-bank/practice-shares/');
    expect(entry).toContain('That practice-set code is invalid.');
    expect(joinModal).toContain('role="dialog"');
    expect(joinModal).toContain('aria-modal="true"');
    expect(joinRoute).toContain("redirect('/question-bank?join=1')");
    expect(sharedPage).toContain('Invalid practice-set code');
    expect(sharedPage).not.toContain('notFound()');
    expect(validationRoute).toContain('getPracticeShare');
    expect(validationRoute).toContain('valid: false');
  });

  it('paginates browser-local fixed queues instead of loading every question at once', () => {
    const storage = read(
      'lib/question-bank/local-practice-session-storage.ts',
    );
    const localPage = read(
      'components/question-bank/local-practice-session-page.tsx',
    );
    const hydrationRoute = read(
      'app/api/question-bank/practice-builder/local-session-page/route.ts',
    );

    expect(storage).toContain('pageSize = 50');
    expect(storage).toContain('Math.ceil(session.totalCount / safePageSize)');
    expect(localPage).toContain('Queue page');
    expect(localPage).toContain('only this page is hydrated from the server');
    expect(hydrationRoute).toContain('const MAX_PAGE_ITEMS = 100');
  });
});

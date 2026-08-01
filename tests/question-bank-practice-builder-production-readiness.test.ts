import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Question Bank practice builder production readiness', () => {
  it('uses the dark-safe builder, custom site selects and no product question ceiling', () => {
    const page = read('app/question-bank/build/page.tsx');
    const builder = read(
      'components/question-bank/practice-set-builder-v3.tsx',
    );
    const styles = read(
      'components/question-bank/practice-set-builder-v2.module.css',
    );

    expect(page).toContain('<PracticeSetBuilderV3');
    expect(builder).toContain("import { AppSelect } from '@/components/ui/app-select'");
    expect(builder).toContain('<AppSelect');
    expect(builder).not.toContain('<select');
    expect(builder).not.toContain('Sparkles');
    expect(builder).not.toContain('type="number"');
    expect(builder).toContain('+{increment}');
    expect(builder).toContain('Maximum {maximum.toLocaleString()}');
    expect(builder).not.toContain('SESSION_MAXIMUM');
    expect(builder).not.toContain('BLOCK_MAXIMUM');
    expect(builder).toContain('<PracticeShareDialog');
    expect(builder).toContain('Saved status');
    expect(builder).toContain('Calculator');
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
    expect(fullscreen).toContain('layoutRef.current !== nextLayout');
    expect(fullscreen).toContain('toolbarRef.current !== nextToolbar');
  });

  it('adds an exact full source-topic catalogue for all subjects', () => {
    const migration = read(
      'supabase/migrations/20260801013000_question_bank_practice_builder_full_topic_catalog.sql',
    );

    expect(migration).toContain("'source-topics'");
    expect(migration).toContain("'source-topic-' || substr(md5");
    expect(migration).toContain('dp_qb_concept_topic_memberships');
    expect(migration).toContain("variant.render_status = 'ready'");
    expect(migration).toContain(
      'Exact source taxonomy mapping by subject and canonical topic key.',
    );
    expect(migration).toContain('Cross-subject source-topic mapping detected');
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

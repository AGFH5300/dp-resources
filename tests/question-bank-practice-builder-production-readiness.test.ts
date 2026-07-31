import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Question Bank practice builder production readiness', () => {
  it('uses the rebuilt dark-safe builder and custom site select', () => {
    const page = read('app/question-bank/build/page.tsx');
    const builder = read(
      'components/question-bank/practice-set-builder-v2.tsx',
    );
    const styles = read(
      'components/question-bank/practice-set-builder-v2.module.css',
    );

    expect(page).toContain('<PracticeSetBuilderV2');
    expect(builder).toContain("import { AppSelect } from '@/components/ui/app-select'");
    expect(builder).toContain('<AppSelect');
    expect(builder).not.toContain('<select');
    expect(builder).not.toContain('Sparkles');
    expect(builder).not.toContain('type="number"');
    expect(builder).toContain('>+{increment}<');
    expect(builder).toContain('Maximum {maximum.toLocaleString()}');
    expect(builder).toContain('SESSION_MAXIMUM = 200');
    expect(builder).toContain('maximumForBlock');
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
    expect(migration).toContain('variant.render_status = \'ready\'');
    expect(migration).toContain(
      'Exact source taxonomy mapping by subject and canonical topic key.',
    );
    expect(migration).toContain('Cross-subject source-topic mapping detected');
  });
});

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Question Bank session blocker fixes', () => {
  it('removes localized maximum-mark preambles already represented by the marks badge', () => {
    const source = '[Puntaje máximo: 5\\]\n\n**Vas a escuchar un pódcast.**';
    expect(normalizeQuestionSource(source)).toBe('**Vas a escuchar un pódcast.**');
  });

  it('opens Join as an in-page modal and keeps the legacy route as a redirect', () => {
    const landing = read('app/question-bank/page.tsx');
    const modal = read(
      'components/question-bank/question-bank-join-modal.tsx',
    );
    const route = read('app/question-bank/join/page.tsx');

    expect(landing).toContain('<QuestionBankJoinModal />');
    expect(landing).not.toContain('href="/question-bank/join"');
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('event.currentTarget === event.target');
    expect(route).toContain("redirect('/question-bank?join=1')");
  });

  it('prevents browser focus and autofill from repainting the code input', () => {
    const entry = read('components/question-bank/practice-code-entry.tsx');
    const styles = read(
      'components/question-bank/practice-code-entry.module.css',
    );

    expect(entry).toContain('styles.shell');
    expect(entry).toContain('styles.input');
    expect(styles).toContain('.input:-webkit-autofill');
    expect(styles).toContain('var(--practice-code-background)');
    expect(styles).toContain('background: transparent !important');
  });

  it('keeps preview read-only and guarantees Max all never writes zero', () => {
    const builder = read(
      'components/question-bank/practice-set-builder-v4.tsx',
    );

    expect(builder).not.toContain('requestedCount: row.candidateCount');
    expect(builder).toContain('Use all courses');
    expect(builder).toContain('useAllCoursesForAllBlocks');
    expect(builder).toContain('zeroAllocationKeys');
    expect(builder).toContain('result.recommendedCount < 1');
    expect(builder).toContain('if (isMaximizing || !blocks.length) return;');
  });
});

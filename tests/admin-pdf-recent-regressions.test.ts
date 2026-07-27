import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { safeDownloadName } from '../lib/drive-utils';

const rootLayout = readFileSync('app/layout.tsx', 'utf8');
const questionRoute = readFileSync(
  'app/api/question-bank/questions/[variantId]/route.ts',
  'utf8',
);
const stateControls = readFileSync(
  'components/question-bank/question-state-controls.tsx',
  'utf8',
);
const recentPage = readFileSync('app/recent/page.tsx', 'utf8');

describe('Question Bank admin dark mode', () => {
  it('overrides the blue total panel with readable light text in dark mode', () => {
    expect(rootLayout).toContain("html[data-theme='dark'] .bg-blue-50.text-blue-950");
    expect(rootLayout).toContain('color: #eff6ff');
    expect(rootLayout).toContain('color: #bfdbfe');
    expect(rootLayout).toContain('color: #dbeafe');
  });
});

describe('Unicode resource filenames in HTTP headers', () => {
  it('converts Unicode punctuation to an ASCII-safe filename', () => {
    const filename = safeDownloadName(
      'Etiology Of Abnormal Psychology — Explanations For Disorders.pdf',
    );
    expect(filename).toBe(
      'Etiology Of Abnormal Psychology - Explanations For Disorders.pdf',
    );
    expect(() =>
      new Headers({
        'content-disposition': `inline; filename="${filename}"`,
      }),
    ).not.toThrow();
  });
});

describe('Recent Question Bank views', () => {
  it('records the view in the authenticated question-details request', () => {
    expect(questionRoute).toContain('async function recordQuestionView');
    expect(questionRoute).toContain(".from('dp_qb_user_progress').upsert(");
    expect(questionRoute).toContain('last_viewed_at: now');
    expect(questionRoute).toContain('viewedProgress.status');
    expect(stateControls).not.toContain('viewed: true');
  });

  it('loads progress and variant metadata separately and uses the canonical workspace URL', () => {
    expect(recentPage).toContain(".from('dp_qb_user_progress')");
    expect(recentPage).toContain(".from('dp_qb_question_variants')");
    expect(recentPage).toContain('variantById');
    expect(recentPage).toContain('?question=${variant.id}');
    expect(recentPage).toContain('export const revalidate = 0');
  });
});

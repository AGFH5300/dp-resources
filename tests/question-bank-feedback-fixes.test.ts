import { describe, expect, it } from 'vitest';

import { questionPreview } from '@/lib/question-bank/content-normalization';
import { dedupePaperOptions } from '@/lib/question-bank/filter-options';

describe('question bank feedback fixes', () => {
  it('removes leaked imported table attributes from question previews', () => {
    expect(
      questionPreview(
        'What does Source A suggest? col1="hide" col2="hide" col3="hide" Source A: The peasants are happy.',
      ),
    ).toBe('What does Source A suggest? Source A: The peasants are happy.');
  });

  it('shows each visible paper reference once', () => {
    expect(
      dedupePaperOptions([
        { id: 'paper-2-a', reference: 'Paper 2' },
        { id: 'paper-3-a', reference: 'Paper 3' },
        { id: 'paper-2-b', reference: ' Paper   2 ' },
        { id: 'paper-1-a', reference: 'Paper 1' },
        { id: 'paper-3-b', reference: 'paper 3' },
      ]),
    ).toEqual([
      { id: 'paper-2-a', reference: 'Paper 2' },
      { id: 'paper-3-a', reference: 'Paper 3' },
      { id: 'paper-1-a', reference: 'Paper 1' },
    ]);
  });
});

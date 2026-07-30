import { describe, expect, it } from 'vitest';

import {
  normalizeQuestionSource,
  questionPreview,
} from '@/lib/question-bank/content-normalization';
import { dedupePaperOptions } from '@/lib/question-bank/filter-options';

describe('question bank feedback fixes', () => {
  it('removes leaked imported table attributes from question previews', () => {
    expect(
      questionPreview(
        'What does Source A suggest? col1="hide" col2="hide" col3="hide" Source A: The peasants are happy.',
      ),
    ).toBe('What does Source A suggest? Source A: The peasants are happy.');
  });

  it('renders PH0232 fractions readably without leaking LaTeX command names', () => {
    const preview = questionPreview(
      String.raw`The gravitational field strength on the surface of the moon is $\dfrac{g_E}{6}$. Two objects of different masses $m$ and $2m$ are released.`,
    );

    expect(preview).toBe(
      'The gravitational field strength on the surface of the moon is gE/6. Two objects of different masses m and 2m are released.',
    );
    expect(preview).not.toMatch(/dfrac|frac|textrm|mathrm/i);
  });

  it('removes complete table-option and image-style metadata, including escaped quotes', () => {
    const normalized = normalizeQuestionSource(
      ':::tableoptions{col1=\\"hide\\" col2=\\"hide\\"}\n' +
        '| A | B |\n' +
        '![Diagram](question:123e4567-e89b-12d3-a456-426614174000){style=\\"padding:10px; border:1px\\"}',
    );

    expect(normalized).not.toMatch(/tableoptions|col1|col2|style=|padding|border:/i);
    expect(normalized).toContain('| A | B |');
    expect(normalized).toContain('![Diagram](question:123e4567-e89b-12d3-a456-426614174000)');
  });

  it('unwraps imported source boxes without losing their readable contents', () => {
    const normalized = normalizeQuestionSource(
      'Source A\n:box[Quoted evidence with CO:sub[2] and [an editorial note].]\nQuestion',
    );

    expect(normalized).not.toContain(':box[');
    expect(normalized).not.toContain(':sub[');
    expect(normalized).toContain('Quoted evidence with CO$_{2}$ and [an editorial note].');
    expect(normalized).toContain('Question');
  });

  it('normalizes unsupported imported containers instead of printing their tokens', () => {
    const normalized = normalizeQuestionSource(
      '1. :::answer\nA supported conclusion.\n:::\n:::centre\nCentered source\n:::',
    );

    expect(normalized).not.toMatch(/:::answer|:::centre/i);
    expect(normalized).toContain('A supported conclusion.');
    expect(normalized).toContain(':::center');
  });

  it('preserves a broken box body while suppressing its opaque wrapper', () => {
    const normalized = normalizeQuestionSource(':box[Readable source text without a closer');

    expect(normalized).toBe('Readable source text without a closer');
  });

  it('removes angle-bracket link markup while preserving the address', () => {
    expect(normalizeQuestionSource('Source: <https://example.com/reference>')).toBe(
      'Source: https://example.com/reference',
    );
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

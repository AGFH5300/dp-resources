import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content-production';

describe('question bank LaTeX answer rendering', () => {
  it('does not leak a nested \\answer macro from a markscheme formula', () => {
    const html = renderToStaticMarkup(
      <QuestionContent
        kind="markscheme"
        source={String.raw`:::center
$-185^\circ\mathrm{C} + 273 = \answer{88\, \textrm{K}}$
:::`}
      />,
    );

    expect(html).not.toContain('\\answer');
    expect(html).toContain('88');
    expect(html).toContain('K');
  });

  it('preserves nested LaTeX while removing only the unsupported wrapper', () => {
    const html = renderToStaticMarkup(
      <QuestionContent
        kind="markscheme"
        source={String.raw`$\answer{\dfrac{64}{3}\,\mathrm{m}}$`}
      />,
    );

    expect(html).not.toContain('\\answer');
    expect(html).toContain('64');
    expect(html).toContain('3');
    expect(html).toContain('m');
  });

  it('keeps supported simple answer macros on the existing answer directive path', () => {
    const html = renderToStaticMarkup(
      <QuestionContent
        kind="markscheme"
        source={String.raw`$\answer{\textrm{A}}$ and $\answer{42}$`}
      />,
    );

    expect(html).not.toContain('\\answer');
    expect(html.match(/dp-qb-answer/g)).toHaveLength(2);
    expect(html).toContain('A');
    expect(html).toContain('42');
  });
});

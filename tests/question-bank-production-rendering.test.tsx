import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content';
import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';
import { parseInteractiveQuestion } from '@/lib/question-bank/interactive';

const audioSourceId = 'b7f46048-e474-4409-8b14-990a5af65d71';
const workspace = readFileSync(
  'components/question-bank/course-practice-workspace.tsx',
  'utf8',
);
const productionContent = readFileSync(
  'components/question-bank/question-content-production.tsx',
  'utf8',
);
const routedContent = readFileSync(
  'components/question-bank/question-content-routed.tsx',
  'utf8',
);
const tsconfig = readFileSync('tsconfig.json', 'utf8');

const content = String.raw`[Maximum mark: 5\]

**You are going to hear a nurse talking to a friend about their first solo night shift.**

:br

:::center
:audio{#${audioSourceId} aid="${audioSourceId}"}
:::

:br

**Choose the three true statements.** :marks[3]
::indent
- A.$\hspace{1em}$It was the nurse's first time working alone.
- B.$\hspace{1em}$The nurse was in charge of many patients.
- C.$\hspace{1em}$The nurse felt relieved but still nervous.
- D.$\hspace{1em}$Mrs. Banda was in bed six.
- E.$\hspace{1em}$The nurse asked for advice before changing the medicine.
- F.$\hspace{1em}$Mrs. Banda felt better in less than an hour.

:br

**Answer the following questions.**

$4.$ $\hspace{1em}$What was the intern learning to do? :marks[1]

$5.$ $\hspace{1em}$How does the nurse describe themselves professionally at the end of the shift? :marks[1]`;

const markScheme = String.raw`$1 - 3.$ $\hspace{1em}$*The answers can be written in any order.*
::indent
- $\hspace{1em}$ $\answer{\textrm{ A, C, F}}$ :marks[3]
::indent
- **A**: $\text{\textquotedblleft}$No supervisor — just me and twelve patients”
The nurse was completely alone for the first time.

:br
$4.$ $\hspace{1em}$ $\answer{\textrm{enter data}}$ :marks[1]

:br
$5.$ $\hspace{1em}$ $\answer{\textrm{a true professional}}$ :marks[1]`;

const longSourceNote = String.raw`:::center
$\footnotesize{\textrm{[© Revision Village 2023. Nature reserve pattern: kjpargeter. Free vector abstract pattern background. Freepik.}}$ $\footnotesize{\textrm{Retrieved June 12, 2023, from https:// www.freepik.com/free-vector/abstract-pattern-background\textunderscore28456133.htm. Copyright free.]}}$
:::`;

describe('EB0383 production rendering', () => {
  it('keeps choices directly below their own instruction', () => {
    const parsed = parseInteractiveQuestion(content, markScheme, 5);

    expect(parsed.promptBeforeChoices).toContain('Choose the three true statements');
    expect(parsed.promptBeforeChoices).not.toContain('Answer the following questions');
    expect(parsed.promptAfterChoices).toContain('Answer the following questions');
    expect(parsed.promptAfterChoices).toContain('4. What was the intern learning');
    expect(parsed.promptAfterChoices).toContain('5. How does the nurse describe');
    expect(parsed.correctChoiceIds).toEqual(['A', 'C', 'F']);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.segments.map((segment) => segment.type)).toEqual([
      'content',
      'choices',
      'content',
      'content',
    ]);
    expect(
      parsed.segments
        .filter((segment) => segment.type === 'content')
        .every((segment) => segment.source.includes('DP_AUDIO_CONTEXT')),
    ).toBe(true);
    const finalSegment = parsed.segments.at(-1);
    expect(finalSegment).toMatchObject({ type: 'content' });
    expect(
      finalSegment?.type === 'content' &&
        finalSegment.source.includes('DP_AUDIO_CONTEXT:final'),
    ).toBe(true);
  });

  it('cleans imported answer commands, quote commands and simple question numbers', () => {
    const normalized = normalizeQuestionSource(markScheme);
    const output = renderToStaticMarkup(
      <QuestionContent source={markScheme} kind="markscheme" />,
    );

    expect(normalized).toContain('1–3.');
    expect(normalized).toContain(':answer[ A, C, F]');
    expect(normalized).toContain('“No supervisor');
    expect(normalized).toContain('4. :answer[enter data]');
    expect(normalized).toContain('5. :answer[a true professional]');
    expect(output).not.toContain('\\answer');
    expect(output).not.toContain('textquotedblleft');
  });

  it('renders long textual source notes as wrapping text instead of unbreakable math', () => {
    const output = renderToStaticMarkup(<QuestionContent source={longSourceNote} />);

    expect(output).toContain('https://www.freepik.com/free-vector/');
    expect(output).toContain('abstract-pattern-background_28456133.htm');
    expect(output).not.toContain('footnotesize');
    expect(output).not.toContain('textunderscore');
    expect(output).not.toContain('class="katex"');
  });

  it('uses the final production wrapper while preserving independent section state', () => {
    expect(tsconfig).toContain(
      '"@/components/question-bank/question-content"',
    );
    expect(tsconfig).toContain('question-content-production.tsx');
    expect(productionContent).toContain("from './question-content-routed'");
    expect(routedContent).toContain('AUDIO_CONTEXT_MARKER');
    expect(routedContent).toContain("mode === 'secondary'");
    expect(routedContent).toContain(
      'isLocallyReferenced || !isReferencedAnywhere',
    );
    expect(routedContent).toContain('if (!cleanSource.trim())');
    expect(workspace).toContain("altText: 'Question audio'");
    expect(workspace).toContain('selectedChoiceIdsBySection');
    expect(workspace).toContain('checkedSectionIds');
    expect(workspace).toContain('renderChoiceSection(segment.sectionId)');
    expect(workspace).toContain('interactive.segments.map');
    expect(workspace).not.toContain('onClick={() => toggleChoice(choice.id)}');
  });
});

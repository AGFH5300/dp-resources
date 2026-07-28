import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content';
import { questionPreview } from '@/lib/question-bank/content-normalization';
import {
  isCorrectSelection,
  parseInteractiveQuestion,
} from '@/lib/question-bank/interactive';

const audioSourceId = 'b7f46048-e474-4409-8b14-990a5af65d71';
const audioAssetId = 'ddbffa21-82d7-5ea9-9826-e4058eb4c965';

const listeningSource = String.raw`**You are going to hear a nurse talking to a friend about their first solo night shift.**

:br
:::center
:audio{#${audioSourceId} aid="${audioSourceId}"}
:::
:br

1 - 3. **Choose the three true statements.** :marks[3]
::indent
- A. It was the nurse's first time working alone.
- B. The nurse was in charge of many patients.
- C. The nurse felt relieved but still nervous.
- D. Mrs. Banda was in bed six.
- E. The nurse asked for advice before changing the medicine.
- F. Mrs. Banda felt better in less than an hour.`;

const listeningMarkScheme = String.raw`1 - 3. *The answers can be written in any order.*
::indent
- $\answer{\textrm{A, C, F}}$ :marks[3]`;

const compositeListeningSource = String.raw`[Maximum mark: 6\]

**You are going to hear a person reflecting on time spent with their grandmother.**

:br
:::center
:audio{#36e42810-f6ba-4026-a9bb-3c68ab93926a aid="36e42810-f6ba-4026-a9bb-3c68ab93926a"}
:::
:br

**Answer the following questions.**

$1.$ $\hspace{1em}$The speaker identifies several activities done during the day by their grandmother. Give **two** answers. :marks[2]

:br

2 - 4.$\hspace{1em}$**Choose the three true statements.** :marks[3]
::indent
- A.$\hspace{1em}$The speaker’s parents worked from home every day.
- B.$\hspace{1em}$The speaker was regularly with their grandmother when he was younger.
- C.$\hspace{1em}$The speaker often felt bored when staying with their grandmother.
- D.$\hspace{1em}$The speaker learned about their family from their grandmother’s stories.
- E.$\hspace{1em}$The grandmother taught the speaker important life values.
- F.$\hspace{1em}$The grandmother enjoyed reading and did not like other activities.

:br
$5.$ $\hspace{1em}$How does the speaker feel about their grandmother’s influence? :marks[1]
::indent
- A.$\hspace{1em}$grateful
- B.$\hspace{1em}$angry
- C.$\hspace{1em}$regretful`;

const compositeListeningMarkScheme = String.raw`$1$. Any two of the following:
- $\answer{\textrm{cooking}}$
- $\answer{\textrm{cleaning}}$

:br
2 - 4. Answers can be written in any order. $\answer{\textrm{B, D, E}}$ :marks[3]
- **B**. The speaker spent a lot of time with their grandmother.
- **D**. The stories taught the speaker about relatives.
- **E**. The grandmother taught important values.

:br
$5.$ $\answer{\textrm{A}}$ :marks[1]
- The speaker is grateful.`;

describe('Revision Village audio rendering', () => {
  it('replaces the imported audio directive in place without exposing identifiers', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={listeningSource}
        assets={[
          {
            id: audioAssetId,
            sourceFileId: audioSourceId,
            role: 'content_reference',
            originalRole: 'audio',
            sortOrder: 0,
            altText: 'Night-shift listening audio',
            contentType: 'audio/mp4',
            audio: {
              provider: 'revision-village',
              sourceAudioId: audioSourceId,
              transcriptId: null,
              transcript: ':u[Transcript]\n\nThe night shift began quietly.',
              durationSeconds: 64.021,
            },
          },
        ]}
      />,
    );

    expect(output).toContain('<audio');
    expect(output).toContain(`/api/question-bank/assets/${audioAssetId}`);
    expect(output).toContain('Read transcript');
    expect(output).toContain('The night shift began quietly.');
    expect(output).not.toContain(':audio');
    expect(output).not.toContain(audioSourceId);
  });

  it('preserves text on both sides of an inline audio directive', () => {
    const source = `Before ${listeningSource.match(/:audio\{[^}]+\}/)?.[0]} After`;
    const output = renderToStaticMarkup(
      <QuestionContent
        source={source}
        assets={[
          {
            id: audioAssetId,
            sourceFileId: audioSourceId,
            role: 'content_reference',
            originalRole: 'audio',
            sortOrder: 0,
            altText: 'Inline listening audio',
            contentType: 'audio/mp4',
            audio: {
              provider: 'revision-village',
              sourceAudioId: audioSourceId,
              transcriptId: null,
              transcript: '',
              durationSeconds: 64.021,
            },
          },
        ]}
      />,
    );

    expect(output.indexOf('Before')).toBeLessThan(output.indexOf('<audio'));
    expect(output.indexOf('<audio')).toBeLessThan(output.indexOf('After'));
    expect(output).not.toContain(audioSourceId);
  });

  it('removes the whole audio directive from list previews', () => {
    const preview = questionPreview(listeningSource);
    expect(preview).toContain('Listening audio.');
    expect(preview).not.toContain(':audio');
    expect(preview).not.toContain(audioSourceId);
    expect(preview).not.toContain('aid=');
  });

  it('renders common imported formatting directives instead of source debris', () => {
    const output = renderToStaticMarkup(
      <QuestionContent source={':u[three] :b[important] H:sup[+]\n::br'} />,
    );
    expect(output).toContain('<u>');
    expect(output).toContain('<strong>');
    expect(output).toContain('<sup>');
    expect(output).not.toContain(':u[');
    expect(output).not.toContain('::br');
  });
});

describe('safe interactive answer parsing', () => {
  it('supports order-independent multi-select questions with an exact selection count', () => {
    const parsed = parseInteractiveQuestion(
      listeningSource,
      listeningMarkScheme,
      5,
    );
    expect(parsed.selectionMode).toBe('multiple');
    expect(parsed.requiredSelectionCount).toBe(3);
    expect(parsed.interactiveMarkCount).toBe(3);
    expect(parsed.isPartialInteraction).toBe(true);
    expect(parsed.correctChoiceIds).toEqual(['A', 'C', 'F']);
    expect(parsed.choices.map((choice) => choice.id)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
    expect(parsed.prompt).not.toContain('- A.');
    expect(isCorrectSelection(['F', 'A', 'C'], parsed.correctChoiceIds)).toBe(true);
    expect(isCorrectSelection(['A', 'B', 'C'], parsed.correctChoiceIds)).toBe(false);
  });

  it('does not misgrade matching exercises that reuse one option bank', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`**Choose an appropriate ending from the list that completes each sentence.**

1. Language...
2. Identity...
3. Bilingualism...
::indent
- A. can present challenges.
- B. shapes personal experience.
- C. connects us to our background.
- D. creates division.
- E. enriches cultural experience.
- F. removes identity.`,
      String.raw`1. $\answer{\textrm{C}}$
2. $\answer{\textrm{B}}$
3. $\answer{\textrm{E}}$`,
    );

    expect(parsed.selectionMode).toBe('none');
    expect(parsed.choices).toEqual([]);
    expect(parsed.prompt).toContain('1. Language...');
    expect(parsed.prompt).toContain('- A. can present challenges.');
  });

  it('supports independent choice blocks in their original positions', () => {
    const parsed = parseInteractiveQuestion(
      compositeListeningSource,
      compositeListeningMarkScheme,
      6,
    );

    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]).toMatchObject({
      id: 'choice-section-1',
      selectionMode: 'multiple',
      requiredSelectionCount: 3,
      correctChoiceIds: ['B', 'D', 'E'],
      interactiveMarkCount: 3,
    });
    expect(parsed.sections[0].choices.map((choice) => choice.id)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
    expect(parsed.sections[1]).toMatchObject({
      id: 'choice-section-2',
      selectionMode: 'single',
      requiredSelectionCount: 1,
      correctChoiceIds: ['A'],
      interactiveMarkCount: 1,
    });
    expect(parsed.sections[1].choices.map((choice) => choice.id)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(parsed.interactiveMarkCount).toBe(4);
    expect(parsed.isPartialInteraction).toBe(true);
    expect(parsed.segments.map((segment) => segment.type)).toEqual([
      'content',
      'choices',
      'content',
      'choices',
      'content',
    ]);
    expect(
      parsed.segments.find(
        (segment) =>
          segment.type === 'content' && segment.source.includes('Give **two** answers'),
      ),
    ).toBeTruthy();
    expect(
      parsed.segments.find(
        (segment) =>
          segment.type === 'content' && segment.source.includes('grandmother’s influence'),
      ),
    ).toBeTruthy();
    expect(parsed.segments.at(-1)).toMatchObject({ type: 'content' });
    expect(
      parsed.segments.at(-1)?.type === 'content' &&
        parsed.segments.at(-1)?.source.includes('DP_AUDIO_CONTEXT:final'),
    ).toBe(true);
    expect(isCorrectSelection(['E', 'B', 'D'], parsed.sections[0].correctChoiceIds)).toBe(
      true,
    );
    expect(isCorrectSelection(['A'], parsed.sections[1].correctChoiceIds)).toBe(true);
  });

  it('recognises legacy bare-letter markschemes without guessing', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`Which option is correct?
- A. First
- B. Second
- C. Third`,
      String.raw`**B**. The second option is correct.`,
      1,
    );
    expect(parsed.selectionMode).toBe('single');
    expect(parsed.correctChoiceIds).toEqual(['B']);
  });

  it('retains a dependable single-answer interaction when confidence is high', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`What is the best answer?
- A. First
- B. Second
- C. Third`,
      String.raw`:answer[B]`,
      1,
    );
    expect(parsed.selectionMode).toBe('single');
    expect(parsed.requiredSelectionCount).toBe(1);
    expect(parsed.correctChoiceId).toBe('B');
    expect(parsed.correctChoiceIds).toEqual(['B']);
    expect(parsed.isPartialInteraction).toBe(false);
  });
});

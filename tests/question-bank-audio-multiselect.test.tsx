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

  it('fails safely for composite questions with several independent MCQ blocks', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`1. What was skateboarding originally called?
- A. Board surfing
- B. Sidewalk skating
- C. Sidewalk surfing

2. How did it become a subculture?
- A. Through the Olympics
- B. Through clothing and music
- C. Through a ban`,
      String.raw`1. $\answer{\textrm{C}}$
2. $\answer{\textrm{B}}$`,
    );

    expect(parsed.selectionMode).toBe('none');
    expect(parsed.choices).toEqual([]);
    expect(parsed.correctChoiceIds).toEqual([]);
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

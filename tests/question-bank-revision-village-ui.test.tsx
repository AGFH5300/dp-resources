import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content';
import { SolutionVideo } from '@/components/question-bank/solution-video';

describe('Revision Village Question Bank media presentation', () => {
  it('renders authenticated audio playback and a cleaned transcript', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source="Listen and answer the question."
        assets={[
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            sourceFileId: null,
            role: 'content_reference',
            originalRole: 'audio',
            sortOrder: 0,
            altText: 'Identity listening passage',
            contentType: 'audio/mp4',
            byteSize: 1234,
            audio: {
              provider: 'revision_village',
              sourceAudioId: 'audio-1',
              transcriptId: 'transcript-1',
              transcript: ':u[Transcript]\\r\\nFirst line.\\r\\nSecond line.',
              durationSeconds: 65,
            },
          },
        ]}
      />,
    );

    expect(output).toContain('<audio');
    expect(output).toContain(
      '/api/question-bank/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(output).toContain('Read transcript');
    expect(output).toContain('First line.');
    expect(output).not.toContain(':u[Transcript]');
    expect(output).toContain('1:05');
  });

  it('shows provider-neutral solution identifiers without treating them as broken URLs', () => {
    const output = renderToStaticMarkup(
      <SolutionVideo
        url="dp-solution-id://revision_village/e3f2f95a-03f5-43b5-82c5-34860c17a85e"
        title="Question solution"
      />,
    );

    expect(output).toContain('Revision Village');
    expect(output).toContain('e3f2f95a-03f5-43b5-82c5-34860c17a85e');
    expect(output).not.toContain('This solution video is unavailable');
  });
});

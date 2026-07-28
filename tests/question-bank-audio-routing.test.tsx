import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content';
import type { QuestionAsset } from '@/lib/question-bank/types';

const directSourceId = '11111111-1111-4111-8111-111111111111';
const fallbackSourceId = '22222222-2222-4222-8222-222222222222';

const assets: QuestionAsset[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sourceFileId: directSourceId,
    role: 'content_reference',
    originalRole: 'audio',
    sortOrder: 0,
    altText: 'Direct audio',
    contentType: 'audio/mp4',
    audio: {
      provider: 'revision-village',
      sourceAudioId: directSourceId,
      transcriptId: null,
      transcript: '',
      durationSeconds: 30,
    },
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    sourceFileId: fallbackSourceId,
    role: 'content_reference',
    originalRole: 'audio',
    sortOrder: 1,
    altText: 'Fallback audio',
    contentType: 'audio/mp4',
    audio: {
      provider: 'revision-village',
      sourceAudioId: fallbackSourceId,
      transcriptId: null,
      transcript: '',
      durationSeconds: 20,
    },
  },
];

function audioCount(output: string) {
  return (output.match(/<audio/g) || []).length;
}

describe('segment-aware Question Bank audio routing', () => {
  it('renders only locally referenced audio in a non-final segment', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={`[[DP_AUDIO_CONTEXT:secondary:${directSourceId}:audio{]]\n:audio{#${directSourceId} aid="${directSourceId}"}`}
        assets={assets}
      />,
    );

    expect(audioCount(output)).toBe(1);
    expect(output).toContain(`/api/question-bank/assets/${assets[0].id}`);
    expect(output).not.toContain(`/api/question-bank/assets/${assets[1].id}`);
    expect(output).not.toContain('DP_AUDIO_CONTEXT');
  });

  it('renders unmatched fallback audio once in the final content segment', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={`[[DP_AUDIO_CONTEXT:final:${directSourceId}:audio{]]\nFinal written question.`}
        assets={assets}
      />,
    );

    expect(audioCount(output)).toBe(1);
    expect(output).not.toContain(`/api/question-bank/assets/${assets[0].id}`);
    expect(output).toContain(`/api/question-bank/assets/${assets[1].id}`);
    expect(output).toContain('Final written question.');
    expect(output).not.toContain('DP_AUDIO_CONTEXT');
  });

  it('keeps local direct audio and one unmatched fallback together in a final segment', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={`[[DP_AUDIO_CONTEXT:final:${directSourceId}:audio{]]\n:audio{#${directSourceId} aid="${directSourceId}"}`}
        assets={assets}
      />,
    );

    expect(audioCount(output)).toBe(2);
    expect(output).toContain(`/api/question-bank/assets/${assets[0].id}`);
    expect(output).toContain(`/api/question-bank/assets/${assets[1].id}`);
  });

  it('accepts and consumes textual audio IDs without leaking or duplicating markers', () => {
    const textualSourceId = 'audio/source 1';
    const textualAsset: QuestionAsset = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sourceFileId: null,
      role: 'content_reference',
      originalRole: 'audio',
      sortOrder: 0,
      altText: 'Textual source audio',
      contentType: 'audio/mp4',
      audio: {
        provider: 'revision-village',
        sourceAudioId: textualSourceId,
        transcriptId: null,
        transcript: '',
        durationSeconds: 12,
      },
    };
    const output = renderToStaticMarkup(
      <QuestionContent
        source={`[[DP_AUDIO_CONTEXT:secondary:${encodeURIComponent(textualSourceId)}:audio{]]\n:audio{#11111111-1111-4111-8111-111111111111 aid="${textualSourceId}"}`}
        assets={[textualAsset]}
      />,
    );

    expect(audioCount(output)).toBe(1);
    expect(output).toContain(`/api/question-bank/assets/${textualAsset.id}`);
    expect(output).not.toContain('DP_AUDIO_CONTEXT');
    expect(output).not.toContain(encodeURIComponent(textualSourceId));
    expect(output).not.toContain(textualSourceId);
  });
});

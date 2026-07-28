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

  it('resolves every source UUID for a deduplicated image asset', () => {
    const primarySourceId = '11111111-1111-4111-8111-111111111111';
    const aliasSourceId = '22222222-2222-4222-8222-222222222222';
    const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const output = renderToStaticMarkup(
      <QuestionContent
        source={`![Primary](question:${primarySourceId})\n\n![Alias](question:${aliasSourceId})`}
        assets={[
          {
            id: assetId,
            sourceFileId: primarySourceId,
            sourceFileIds: [primarySourceId, aliasSourceId],
            role: 'question',
            originalRole: 'question',
            sortOrder: 0,
            altText: 'Deduplicated diagram',
            contentType: 'image/png',
            byteSize: 1234,
            audio: null,
          },
        ]}
      />,
    );

    expect(
      output.match(new RegExp(`/api/question-bank/assets/${assetId}`, 'g')) || [],
    ).toHaveLength(2);
    expect(output).not.toContain('Referenced image is unavailable');
  });

  it('normalizes copied source directives and link placeholders', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={String.raw`:::centre
:tableoptions{col1="hide"}
:box[Inquiry source]
H:sub[2]O
https<no link>://example<no link>.com/source
:::`}
      />,
    );

    expect(output).toContain('Inquiry source');
    expect(output).toContain('H');
    expect(output).toContain('2');
    expect(output).toContain('O');
    expect(output).toContain('https://example.com/source');
    expect(output).not.toContain(':box[');
    expect(output).not.toContain(':sub[');
    expect(output).not.toContain('tableoptions');
    expect(output).not.toContain(':::centre');
    expect(output).not.toContain('no link');
  });

  it('repairs incomplete pipe rows only inside imported table blocks', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={String.raw`::answer[**B**]
:::tableoptions{}
|1st IE|2nd IE|
|:-:|:-:|
1000|2252
:::`}
        kind="markscheme"
      />,
    );

    expect(output).toContain('<table>');
    expect(output).toContain('1000');
    expect(output).toContain('2252');
    expect(output).toContain('dp-qb-answer');
    expect(output).not.toContain('1000|2252');
    expect(output).not.toContain('::answer[');
  });

  it('renders curated fallbacks for every genuinely absent archive image', () => {
    const output = renderToStaticMarkup(
      <>
        <QuestionContent source="![Viking map](question:d8591cfe-c657-4825-868b-73faf4717afe)" />
        <QuestionContent source="![BU 6635](question:d1b6e570-d496-4d18-be0d-334c2eb6f610)" />
        <QuestionContent source="![EEZ diagram](question:2dc1e4ff-51a6-483d-a2b0-a87717452ccd)" />
        <QuestionContent source="![EEZ sample](question:25599f25-fda4-4c8b-a984-af11e9f0b9e6)" />
      </>,
    );

    expect(output).toContain('upload.wikimedia.org/wikipedia/commons/6/6c/Erikr-eng.png');
    expect(output).toContain(
      'upload.wikimedia.org/wikipedia/commons/6/62/Displaced_Persons_and_Refugees_in_Germany_BU6635.jpg',
    );
    expect((output.match(/data:image\/svg\+xml/g) || []).length).toBe(2);
    expect(output).not.toContain('Referenced image is unavailable');
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

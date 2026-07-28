import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content';

it('resolves a markscheme reference through a question-role attachment alias', () => {
  const primarySourceId = '11111111-1111-4111-8111-111111111111';
  const aliasSourceId = '22222222-2222-4222-8222-222222222222';
  const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const output = renderToStaticMarkup(
    <QuestionContent
      source={`![Aliased markscheme diagram](markscheme:${aliasSourceId})`}
      kind="markscheme"
      assets={[
        {
          id: assetId,
          sourceFileId: primarySourceId,
          sourceFileIds: [primarySourceId, aliasSourceId],
          role: 'question',
          originalRole: 'question',
          sortOrder: 0,
          altText: 'Aliased diagram',
          contentType: 'image/png',
          byteSize: 1234,
          audio: null,
        },
      ]}
    />,
  );

  expect(output).toContain(`/api/question-bank/assets/${assetId}`);
  expect(output).not.toContain('Referenced image is unavailable');
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuestionContent } from '@/components/question-bank/question-content';
import type { QuestionAsset } from '@/lib/question-bank/types';

const sourceFileIds = [
  '970c4080-cf2f-4d6f-a53f-d961d6e55fc0',
  '6259008a-d9d1-4035-ad36-22c3db14d45f',
  'f6e5292a-e3c0-4b97-af61-b77618ebcf26',
  '40d2ffbc-bf44-423b-8616-4cac9e94b98a',
  '0f1acbb2-e0ad-4b39-a93a-217112260cd5',
  'a79fa39d-2120-442d-a8d7-61aa7bdc533c',
  '7a97abe6-5281-42e1-8707-34bee8d7bdaf',
  '8b39efe4-e371-489d-b6df-88b4faa0bbc5',
];

const assets: QuestionAsset[] = sourceFileIds.map((sourceFileId, index) => ({
  id: `asset-${index + 1}`,
  sourceFileId,
  role: 'question',
  sortOrder: index,
  altText: `Answer diagram ${index + 1}`,
}));

describe('question-bank inline protected images', () => {
  it('renders PH0259 image choices inside Markdown table cells', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={`| A. | ![PH0259A](question:${sourceFileIds[0]}) | B. | ![PH0259B](question:${sourceFileIds[1]}) |
|---|---|---|---|
| C. | ![PH0259C](question:${sourceFileIds[2]}) | D. | ![PH0259D](question:${sourceFileIds[3]}) |`}
        assets={assets}
      />,
    );

    expect(output.match(/<img/g)).toHaveLength(4);
    expect(output).toContain('/api/question-bank/assets/asset-1');
    expect(output).toContain('/api/question-bank/assets/asset-4');
    expect(output).toContain('alt="PH0259A"');
    expect(output).not.toContain('question:');
    expect(output).not.toContain('![PH0259');
  });

  it('renders PH0545 image choices and images mixed with paragraph text', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source={`| A. | ![PH0545a](question:${sourceFileIds[4]}) | B. | ![PH0545b](question:${sourceFileIds[5]}) |
|---|---|---|---|
| C. | ![PH0545c](question:${sourceFileIds[6]}) | D. | ![PH0545d](question:${sourceFileIds[7]}) |

Compare ![PH0545a](question:${sourceFileIds[4]}) with the options above.`}
        assets={assets}
      />,
    );

    expect(output.match(/<img/g)).toHaveLength(5);
    expect(output).toContain('/api/question-bank/assets/asset-5');
    expect(output).toContain('/api/question-bank/assets/asset-8');
    expect(output).toContain('Compare ');
    expect(output).toContain(' with the options above.');
    expect(output).not.toContain('question:');
    expect(output).not.toContain('![PH0545');
  });

  it('shows the controlled unavailable message instead of leaking a raw token', () => {
    const output = renderToStaticMarkup(
      <QuestionContent
        source="| A. | ![Missing](question:11111111-1111-4111-8111-111111111111) |"
        assets={[]}
      />,
    );

    expect(output).toContain(
      'Referenced image is unavailable in the authorized archive.',
    );
    expect(output).not.toContain('question:11111111');
  });
});

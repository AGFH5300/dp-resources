import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDecryptedQuestion,
  classifyTargets,
  explicitQuestionsFromNextData,
  extractNextData,
  extractVerifiedTargets,
} from '../scripts/question-bank/revision-village-delta.mjs';

const QUESTION_ID = '11111111-1111-4111-8111-111111111111';
const PAPER_ID = '22222222-2222-4222-8222-222222222222';
const REMOVED_ID = '33333333-3333-4333-8333-333333333333';
const ENGLISH_ID = '44444444-4444-4444-8444-444444444444';

test('extracts verified question targets while rejecting paper and removed rows', () => {
  const report = {
    confirmedNew: [
      {
        id: QUESTION_ID,
        reference: 'HI1909',
        route: 'https://www.revisionvillage.com/ib-history/hl-2028/questionbank/topic/',
      },
    ],
    rejected: [
      {
        id: PAPER_ID,
        references: ['Paper 1'],
        routes: ['https://www.revisionvillage.com/ib-history/hl/questionbank/topic/'],
        reason: 'paper-definition-id',
      },
    ],
    removed: [
      {
        id: REMOVED_ID,
        reference: 'AA1044',
        route: 'https://www.revisionvillage.com/ib-math/analysis-and-approaches-hl/questionbank/',
        status: 'not-found-on-july-routes',
      },
    ],
  };

  assert.deepEqual(extractVerifiedTargets(report, { expected: 1 }), [
    {
      id: QUESTION_ID,
      reference: 'HI1909',
      route: 'https://www.revisionvillage.com/ib-history/hl-2028/questionbank/topic/',
    },
  ]);
});

test('quarantines retired English B while keeping supported subjects active', () => {
  const { active, quarantined } = classifyTargets([
    {
      id: QUESTION_ID,
      reference: 'HI1909',
      route: 'https://www.revisionvillage.com/ib-history/hl/questionbank/topic/',
    },
    {
      id: ENGLISH_ID,
      reference: 'EB0408',
      route: 'https://www.revisionvillage.com/ib-english-b/hl/questionbank/identities/',
    },
  ]);

  assert.equal(active.length, 1);
  assert.equal(active[0].subjectGroup, 'ib-history');
  assert.equal(quarantined.length, 1);
  assert.deepEqual(
    {
      id: quarantined[0].id,
      subjectGroup: quarantined[0].subjectGroup,
      quarantineReason: quarantined[0].quarantineReason,
    },
    {
      id: ENGLISH_ID,
      subjectGroup: 'ib-english-b',
      quarantineReason: 'retired-subject-group',
    },
  );
});

test('accepts IDs only from explicit questions arrays, not generic paper definitions', () => {
  const nextData = {
    props: {
      pageProps: {
        paper: {
          id: PAPER_ID,
          reference: 'Paper 1',
        },
        dehydratedState: {
          queries: [
            {
              state: {
                data: {
                  questions: [
                    {
                      id: QUESTION_ID,
                      reference: 'PH1837',
                      content: 'U2FsdGVkX1example',
                      markScheme: 'U2FsdGVkX1scheme',
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  };

  assert.deepEqual(explicitQuestionsFromNextData(nextData).map((row) => row.id), [
    QUESTION_ID,
  ]);
});

test('extracts the Next.js data script from HTML', () => {
  const payload = {
    props: {
      pageProps: {
        dehydratedState: {
          queries: [],
        },
      },
    },
  };
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    payload,
  )}</script></body></html>`;
  assert.deepEqual(extractNextData(html), payload);
});

test('rejects still-encrypted question or markscheme payloads', () => {
  assert.throws(
    () =>
      assertDecryptedQuestion({
        id: QUESTION_ID,
        content: 'U2FsdGVkX1encrypted',
        markScheme: '<p>answer</p>',
      }),
    /still encrypted/i,
  );

  assert.throws(
    () =>
      assertDecryptedQuestion({
        id: QUESTION_ID,
        content: '<p>question</p>',
        markScheme: 'U2FsdGVkX1encrypted',
      }),
    /still encrypted/i,
  );
});

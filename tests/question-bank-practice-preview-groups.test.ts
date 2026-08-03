import { describe, expect, it } from 'vitest';

import type { PracticeCandidate } from '@/lib/question-bank/practice-allocation';
import type { PracticeConfiguration } from '@/lib/question-bank/practice-configuration';
import { createPracticePreview } from '@/lib/question-bank/practice-engine';

const configuration: PracticeConfiguration = {
  schemaVersion: 1,
  orderingMode: 'interleaved',
  filters: {
    difficulties: ['easy', 'medium', 'hard', 'unrated'],
    statuses: ['not_started', 'in_progress', 'completed'],
    saved: null,
    calculator: null,
  },
  blocks: ['topic-one', 'topic-two'].map((key) => ({
    key,
    selectionType: 'concept' as const,
    conceptId: '11111111-1111-4111-8111-111111111111',
    courseIds: ['22222222-2222-4222-8222-222222222222'],
    requestedCount: 2,
    filters: {},
  })),
};

function candidate(blockId: string, questionId: string): PracticeCandidate {
  return {
    blockId,
    questionId,
    variantId: `variant-${questionId}`,
    courseId: 'course-one',
  };
}

describe('Question Bank subject preview totals', () => {
  it('deduplicates overlapping topic candidates within each subject', () => {
    const candidates = [
      candidate('topic-one', 'question-one'),
      candidate('topic-one', 'question-shared'),
      candidate('topic-two', 'question-shared'),
      candidate('topic-two', 'question-two'),
    ];

    const { preview } = createPracticePreview(configuration, candidates, [
      {
        key: 'biology',
        blockKeys: ['topic-one', 'topic-two'],
      },
    ]);

    expect(preview.blocks.map((block) => block.candidateCount)).toEqual([2, 2]);
    expect(preview.totalUniqueAvailable).toBe(3);
    expect(preview.allocatedCount).toBe(3);
    expect(preview.groups).toEqual([
      {
        key: 'biology',
        allocatedCount: 3,
        totalUniqueAvailable: 3,
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import type { PracticeCandidate } from '@/lib/question-bank/practice-allocation';
import { maximizePracticeBlockCounts } from '@/lib/question-bank/practice-maximization';

function candidate(blockId: string, questionId: string): PracticeCandidate {
  return {
    blockId,
    questionId,
    variantId: `${blockId}-${questionId}-variant`,
    courseId: `${blockId}-course`,
    coursePriority: 0,
    variantPriority: 0,
    stableOrder: Number(questionId.replace(/\D/g, '')) || 0,
  };
}

describe('Question Bank Max all allocation', () => {
  it('distributes a completely shared pool rather than assigning zero to later blocks', () => {
    const candidates = ['q1', 'q2', 'q3', 'q4'].flatMap((questionId) => [
      candidate('biology-a', questionId),
      candidate('biology-b', questionId),
    ]);
    const result = maximizePracticeBlockCounts(
      [
        { blockId: 'biology-a', sortOrder: 0 },
        { blockId: 'biology-b', sortOrder: 1 },
      ],
      candidates,
    );

    expect(result.totalUniqueAllocated).toBe(4);
    expect(result.blocks.map((block) => block.recommendedCount)).toEqual([2, 2]);
  });

  it('protects a narrow topic while still using every unique question', () => {
    const result = maximizePracticeBlockCounts(
      [
        { blockId: 'broad', sortOrder: 0 },
        { blockId: 'narrow', sortOrder: 1 },
      ],
      [
        candidate('broad', 'q1'),
        candidate('broad', 'q2'),
        candidate('broad', 'q3'),
        candidate('narrow', 'q1'),
      ],
    );

    expect(result.totalUniqueAllocated).toBe(3);
    expect(result.blocks).toEqual([
      { blockId: 'broad', candidateCount: 3, recommendedCount: 2 },
      { blockId: 'narrow', candidateCount: 1, recommendedCount: 1 },
    ]);
  });

  it('returns jointly feasible counts for several overlapping topics', () => {
    const result = maximizePracticeBlockCounts(
      [
        { blockId: 'a', sortOrder: 0 },
        { blockId: 'b', sortOrder: 1 },
        { blockId: 'c', sortOrder: 2 },
      ],
      [
        candidate('a', 'q1'),
        candidate('a', 'q2'),
        candidate('a', 'q3'),
        candidate('b', 'q2'),
        candidate('b', 'q3'),
        candidate('b', 'q4'),
        candidate('c', 'q3'),
        candidate('c', 'q4'),
        candidate('c', 'q5'),
      ],
    );

    expect(result.totalUniqueAllocated).toBe(5);
    expect(result.blocks.reduce((sum, block) => sum + block.recommendedCount, 0)).toBe(
      5,
    );
    expect(result.blocks.every((block) => block.recommendedCount > 0)).toBe(true);
  });

  it('keeps every one of 24 heavily overlapping subject topics above zero', () => {
    const blocks = Array.from({ length: 24 }, (_, index) => ({
      blockId: `biology-${index + 1}`,
      sortOrder: index,
    }));
    const shared = Array.from({ length: 100 }, (_, index) => `shared-${index + 1}`);
    const candidates = blocks.flatMap((block, index) => [
      ...shared.map((questionId) => candidate(block.blockId, questionId)),
      candidate(block.blockId, `topic-specific-${index + 1}`),
    ]);

    const result = maximizePracticeBlockCounts(blocks, candidates);

    expect(result.totalUniqueAllocated).toBe(124);
    expect(
      result.blocks.reduce((total, block) => total + block.recommendedCount, 0),
    ).toBe(124);
    expect(result.blocks.every((block) => block.recommendedCount > 0)).toBe(true);
  });

  it('reports a genuinely empty topic instead of claiming Max all succeeded', () => {
    const result = maximizePracticeBlockCounts(
      [
        { blockId: 'available', sortOrder: 0 },
        { blockId: 'empty', sortOrder: 1 },
      ],
      [candidate('available', 'q1')],
    );

    expect(result.totalUniqueAllocated).toBe(1);
    expect(result.blocks).toEqual([
      { blockId: 'available', candidateCount: 1, recommendedCount: 1 },
      { blockId: 'empty', candidateCount: 0, recommendedCount: 0 },
    ]);
  });
});

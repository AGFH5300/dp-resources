import { describe, expect, it } from 'vitest';

import {
  allocatePracticeQuestions,
  orderPracticeAllocations,
  type PracticeAllocation,
  type PracticeCandidate,
} from '@/lib/question-bank/practice-allocation';

function candidate(
  blockId: string,
  questionId: string,
  overrides: Partial<PracticeCandidate> = {},
): PracticeCandidate {
  return {
    blockId,
    questionId,
    variantId: `${blockId}-${questionId}-variant`,
    courseId: `${blockId}-course`,
    coursePriority: 0,
    variantPriority: 0,
    stableOrder: Number(questionId.replace(/\D/g, '')) || 0,
    ...overrides,
  };
}

describe('Question Bank practice allocation', () => {
  it('uses maximum-cardinality matching so broad blocks cannot starve constrained blocks', () => {
    const result = allocatePracticeQuestions(
      [
        { blockId: 'broad', requestedCount: 1, sortOrder: 0 },
        { blockId: 'constrained', requestedCount: 2, sortOrder: 1 },
      ],
      [
        candidate('broad', 'q1'),
        candidate('broad', 'q2'),
        candidate('broad', 'q3'),
        candidate('constrained', 'q1'),
        candidate('constrained', 'q2'),
      ],
    );

    expect(result.requestedCount).toBe(3);
    expect(result.allocatedCount).toBe(3);
    expect(result.shortages).toEqual([]);
    expect(
      result.allocations
        .filter((allocation) => allocation.blockId === 'constrained')
        .map((allocation) => allocation.questionId)
        .sort(),
    ).toEqual(['q1', 'q2']);
    expect(
      result.allocations.find((allocation) => allocation.blockId === 'broad')
        ?.questionId,
    ).toBe('q3');
  });

  it('deduplicates question cores across blocks and retains every match', () => {
    const result = allocatePracticeQuestions(
      [
        { blockId: 'kinematics', requestedCount: 1, sortOrder: 0 },
        { blockId: 'forces', requestedCount: 1, sortOrder: 1 },
      ],
      [
        candidate('kinematics', 'shared'),
        candidate('kinematics', 'kinematics-only'),
        candidate('forces', 'shared'),
        candidate('forces', 'forces-only'),
      ],
    );

    expect(result.allocatedCount).toBe(2);
    expect(new Set(result.allocations.map((row) => row.questionId)).size).toBe(2);
    const shared = result.allocations.find((row) => row.questionId === 'shared');
    if (shared)
      expect(shared.matchedBlockIds).toEqual(['forces', 'kinematics']);
  });

  it('selects the best deterministic representative variant per block and question', () => {
    const result = allocatePracticeQuestions(
      [{ blockId: 'integration', requestedCount: 1 }],
      [
        candidate('integration', 'q1', {
          variantId: 'legacy-hl',
          coursePriority: 2,
          variantPriority: 0,
        }),
        candidate('integration', 'q1', {
          variantId: 'current-hl-incomplete',
          coursePriority: 0,
          variantPriority: 3,
        }),
        candidate('integration', 'q1', {
          variantId: 'current-hl-complete',
          coursePriority: 0,
          variantPriority: 0,
        }),
      ],
    );

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].variantId).toBe('current-hl-complete');
  });

  it('reports exact block shortages instead of silently changing eligibility', () => {
    const result = allocatePracticeQuestions(
      [
        { blockId: 'physics', requestedCount: 2, sortOrder: 0 },
        { blockId: 'maths', requestedCount: 1, sortOrder: 1 },
      ],
      [candidate('physics', 'q1'), candidate('maths', 'q2')],
    );

    expect(result.allocatedCount).toBe(2);
    expect(result.shortages).toEqual([
      {
        blockId: 'physics',
        requestedCount: 2,
        allocatedCount: 1,
        shortage: 1,
        candidateCount: 1,
      },
    ]);
  });

  it('produces stable mixed ordering for the same seed', () => {
    const result = allocatePracticeQuestions(
      [{ blockId: 'block', requestedCount: 5 }],
      ['q1', 'q2', 'q3', 'q4', 'q5'].map((questionId) =>
        candidate('block', questionId),
      ),
    );

    const first = orderPracticeAllocations(
      result.allocations,
      'mixed',
      'fixed-seed',
    ).map((row) => row.questionId);
    const second = orderPracticeAllocations(
      result.allocations,
      'mixed',
      'fixed-seed',
    ).map((row) => row.questionId);
    const different = orderPracticeAllocations(
      result.allocations,
      'mixed',
      'another-seed',
    ).map((row) => row.questionId);

    expect(first).toEqual(second);
    expect(first).not.toEqual(different);
  });

  it('interleaves blocks by quota position rather than grouping them', () => {
    const allocations: PracticeAllocation[] = [
      {
        ...candidate('physics', 'q1'),
        slotIndex: 0,
        blockSlotIndex: 0,
        blockSortOrder: 0,
        matchedBlockIds: ['physics'],
      },
      {
        ...candidate('physics', 'q2'),
        slotIndex: 1,
        blockSlotIndex: 1,
        blockSortOrder: 0,
        matchedBlockIds: ['physics'],
      },
      {
        ...candidate('maths', 'q3'),
        slotIndex: 2,
        blockSlotIndex: 0,
        blockSortOrder: 1,
        matchedBlockIds: ['maths'],
      },
      {
        ...candidate('maths', 'q4'),
        slotIndex: 3,
        blockSlotIndex: 1,
        blockSortOrder: 1,
        matchedBlockIds: ['maths'],
      },
    ];

    expect(
      orderPracticeAllocations(allocations, 'interleaved', 'unused').map(
        (row) => row.blockId,
      ),
    ).toEqual(['physics', 'maths', 'physics', 'maths']);
  });

  it('allocates thousands of questions without a product ceiling', () => {
    const questions = Array.from({ length: 1_500 }, (_, index) => `q${index + 1}`);
    const result = allocatePracticeQuestions(
      [
        { blockId: 'large-a', requestedCount: 700, sortOrder: 0 },
        { blockId: 'large-b', requestedCount: 700, sortOrder: 1 },
      ],
      [
        ...questions.slice(0, 1_000).map((questionId) =>
          candidate('large-a', questionId),
        ),
        ...questions.slice(500).map((questionId) =>
          candidate('large-b', questionId),
        ),
      ],
    );

    expect(result.requestedCount).toBe(1_400);
    expect(result.allocatedCount).toBe(1_400);
    expect(result.shortages).toEqual([]);
    expect(new Set(result.allocations.map((row) => row.questionId)).size).toBe(
      1_400,
    );
  });

  it('still rejects duplicate block identities', () => {
    expect(() =>
      allocatePracticeQuestions(
        [
          { blockId: 'duplicate', requestedCount: 1 },
          { blockId: 'duplicate', requestedCount: 1 },
        ],
        [],
      ),
    ).toThrow('Duplicate practice block');
  });
});

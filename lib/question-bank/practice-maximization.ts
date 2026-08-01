import {
  allocatePracticeQuestions,
  type PracticeCandidate,
} from './practice-allocation';

export type PracticeMaximumBlock = {
  blockId: string;
  sortOrder?: number;
};

export type PracticeMaximumBlockResult = {
  blockId: string;
  candidateCount: number;
  recommendedCount: number;
};

export type PracticeMaximumResult = {
  totalUniqueAllocated: number;
  blocks: PracticeMaximumBlockResult[];
};

function compareText(left: string, right: string) {
  return left.localeCompare(right);
}

function uniqueCandidateCounts(
  blocks: PracticeMaximumBlock[],
  candidates: PracticeCandidate[],
) {
  const questionsByBlock = new Map(
    blocks.map((block) => [block.blockId, new Set<string>()]),
  );
  for (const candidate of candidates) {
    const questions = questionsByBlock.get(candidate.blockId);
    if (!questions)
      throw new Error(`Candidate references unknown block ${candidate.blockId}.`);
    questions.add(candidate.questionId);
  }
  return new Map(
    blocks.map((block) => [
      block.blockId,
      questionsByBlock.get(block.blockId)?.size || 0,
    ]),
  );
}

function fairCapacities(
  blocks: PracticeMaximumBlock[],
  candidateCounts: Map<string, number>,
  requestedTotal: number,
) {
  const capacities = new Map(blocks.map((block) => [block.blockId, 0]));
  let remaining = requestedTotal;

  while (remaining > 0) {
    const active = blocks
      .filter(
        (block) =>
          (capacities.get(block.blockId) || 0) <
          (candidateCounts.get(block.blockId) || 0),
      )
      .sort(
        (left, right) =>
          (capacities.get(left.blockId) || 0) -
            (capacities.get(right.blockId) || 0) ||
          (candidateCounts.get(left.blockId) || 0) -
            (candidateCounts.get(right.blockId) || 0) ||
          (left.sortOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          compareText(left.blockId, right.blockId),
      );
    if (!active.length) break;

    const batch = Math.max(1, Math.floor(remaining / active.length));
    let progressed = false;
    for (const block of active) {
      if (remaining < 1) break;
      const current = capacities.get(block.blockId) || 0;
      const available = candidateCounts.get(block.blockId) || 0;
      const added = Math.min(batch, available - current, remaining);
      if (added < 1) continue;
      capacities.set(block.blockId, current + added);
      remaining -= added;
      progressed = true;
    }
    if (!progressed) break;
  }

  return capacities;
}

function allocationsByBlock(
  blocks: PracticeMaximumBlock[],
  allocations: Array<{ blockId: string }>,
) {
  const counts = new Map(blocks.map((block) => [block.blockId, 0]));
  for (const allocation of allocations) {
    counts.set(allocation.blockId, (counts.get(allocation.blockId) || 0) + 1);
  }
  return counts;
}

/**
 * Finds the largest jointly feasible set of unique question cores while
 * giving every selected block at least one whenever that is jointly possible.
 * Empty or irreconcilably overlapping blocks are returned with zero so the
 * builder can retain them visibly while omitting them from the generated set.
 *
 * The allocation runs in three deterministic maximum-flow stages:
 * 1. reserve one unique question for every block;
 * 2. distribute the remaining pool using balanced water-filled capacities;
 * 3. assign any overlap-constrained leftovers without sacrificing cardinality.
 *
 * Reserving the first question prevents broad, highly overlapping topics from
 * consuming the entire pool and leaving later topics at zero. The final stage
 * still assigns every remaining unique question, so fairness does not reduce
 * the size of the maximized practice set.
 */
export function maximizePracticeBlockCounts(
  blocks: PracticeMaximumBlock[],
  candidates: PracticeCandidate[],
): PracticeMaximumResult {
  if (!blocks.length) throw new Error('At least one practice block is required.');
  const blockIds = new Set(blocks.map((block) => block.blockId));
  if (blockIds.size !== blocks.length)
    throw new Error('Practice block IDs must be unique.');

  const originalCandidateCounts = uniqueCandidateCounts(blocks, candidates);
  const nonEmptyBlocks = blocks.filter(
    (block) => (originalCandidateCounts.get(block.blockId) || 0) > 0,
  );
  if (!nonEmptyBlocks.length) {
    return {
      totalUniqueAllocated: 0,
      blocks: blocks.map((block) => ({
        blockId: block.blockId,
        candidateCount: 0,
        recommendedCount: 0,
      })),
    };
  }
  const nonEmptyBlockIds = new Set(nonEmptyBlocks.map((block) => block.blockId));
  const baseline = allocatePracticeQuestions(
    nonEmptyBlocks.map((block) => ({
      blockId: block.blockId,
      requestedCount: 1,
      sortOrder: block.sortOrder,
    })),
    candidates.filter((candidate) => nonEmptyBlockIds.has(candidate.blockId)),
  );
  const baselineCounts = allocationsByBlock(blocks, baseline.allocations);
  const allocatedBlockIds = new Set(
    baseline.allocations.map((allocation) => allocation.blockId),
  );
  const allocatableBlocks = blocks.filter((block) =>
    allocatedBlockIds.has(block.blockId),
  );

  const reservedQuestions = new Set(
    baseline.allocations.map((allocation) => allocation.questionId),
  );
  const afterBaseline = candidates.filter(
    (candidate) =>
      allocatedBlockIds.has(candidate.blockId) &&
      !reservedQuestions.has(candidate.questionId),
  );
  const afterBaselineCounts = uniqueCandidateCounts(allocatableBlocks, afterBaseline);
  const remainingUnique = new Set(
    afterBaseline.map((candidate) => candidate.questionId),
  ).size;
  const balancedCapacities = fairCapacities(
    allocatableBlocks,
    afterBaselineCounts,
    remainingUnique,
  );
  const balancedBlocks = allocatableBlocks
    .filter((block) => (balancedCapacities.get(block.blockId) || 0) > 0)
    .map((block) => ({
      blockId: block.blockId,
      requestedCount: balancedCapacities.get(block.blockId) || 1,
      sortOrder: block.sortOrder,
    }));
  const balancedBlockIds = new Set(
    balancedBlocks.map((block) => block.blockId),
  );
  const balanced = balancedBlocks.length
    ? allocatePracticeQuestions(
        balancedBlocks,
        afterBaseline.filter((candidate) =>
          balancedBlockIds.has(candidate.blockId),
        ),
      )
    : {
        allocatedCount: 0,
        allocations: [] as ReturnType<
          typeof allocatePracticeQuestions
        >['allocations'],
      };
  const balancedCounts = allocationsByBlock(blocks, balanced.allocations);

  const usedQuestions = new Set([
    ...reservedQuestions,
    ...balanced.allocations.map((allocation) => allocation.questionId),
  ]);
  const leftovers = candidates.filter(
    (candidate) => !usedQuestions.has(candidate.questionId),
  );
  const leftoverCounts = uniqueCandidateCounts(blocks, leftovers);
  const overflowBlocks = allocatableBlocks
    .filter((block) => (leftoverCounts.get(block.blockId) || 0) > 0)
    .map((block) => ({
      blockId: block.blockId,
      requestedCount: leftoverCounts.get(block.blockId) || 1,
      sortOrder: block.sortOrder,
    }));
  const overflowBlockIds = new Set(overflowBlocks.map((block) => block.blockId));
  const overflow = overflowBlocks.length
    ? allocatePracticeQuestions(
        overflowBlocks,
        leftovers.filter((candidate) => overflowBlockIds.has(candidate.blockId)),
      )
    : {
        allocatedCount: 0,
        allocations: [] as ReturnType<
          typeof allocatePracticeQuestions
        >['allocations'],
      };
  const overflowCounts = allocationsByBlock(blocks, overflow.allocations);

  return {
    totalUniqueAllocated:
      baseline.allocatedCount + balanced.allocatedCount + overflow.allocatedCount,
    blocks: blocks.map((block) => ({
      blockId: block.blockId,
      candidateCount: originalCandidateCounts.get(block.blockId) || 0,
      recommendedCount:
        (baselineCounts.get(block.blockId) || 0) +
        (balancedCounts.get(block.blockId) || 0) +
        (overflowCounts.get(block.blockId) || 0),
    })),
  };
}

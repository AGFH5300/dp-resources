export type PracticeBlockRequest = {
  blockId: string;
  requestedCount: number;
  sortOrder?: number;
};

export type PracticeCandidate = {
  blockId: string;
  questionId: string;
  variantId: string;
  courseId: string;
  coursePriority?: number;
  variantPriority?: number;
  difficultyRank?: number | null;
  stableOrder?: number;
};

export type PracticeAllocation = PracticeCandidate & {
  slotIndex: number;
  blockSlotIndex: number;
  blockSortOrder: number;
  matchedBlockIds: string[];
};

export type PracticeBlockShortage = {
  blockId: string;
  requestedCount: number;
  allocatedCount: number;
  shortage: number;
  candidateCount: number;
};

export type PracticeAllocationResult = {
  requestedCount: number;
  allocatedCount: number;
  allocations: PracticeAllocation[];
  shortages: PracticeBlockShortage[];
};

export type PracticeOrderingMode =
  | 'mixed'
  | 'grouped'
  | 'interleaved'
  | 'easier_to_harder'
  | 'source_order';

type Slot = {
  index: number;
  blockId: string;
  blockSlotIndex: number;
  blockSortOrder: number;
};

function compareText(left: string, right: string) {
  return left.localeCompare(right);
}

function finiteNumber(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function compareCandidates(left: PracticeCandidate, right: PracticeCandidate) {
  return (
    finiteNumber(left.coursePriority, Number.MAX_SAFE_INTEGER) -
      finiteNumber(right.coursePriority, Number.MAX_SAFE_INTEGER) ||
    finiteNumber(left.variantPriority, Number.MAX_SAFE_INTEGER) -
      finiteNumber(right.variantPriority, Number.MAX_SAFE_INTEGER) ||
    finiteNumber(left.stableOrder, Number.MAX_SAFE_INTEGER) -
      finiteNumber(right.stableOrder, Number.MAX_SAFE_INTEGER) ||
    compareText(left.variantId, right.variantId)
  );
}

function assertInputs(
  blocks: PracticeBlockRequest[],
  candidates: PracticeCandidate[],
) {
  if (!blocks.length) throw new Error('At least one practice block is required.');
  if (blocks.length > 20)
    throw new Error('A practice set can contain at most 20 blocks.');

  const seenBlocks = new Set<string>();
  let requestedTotal = 0;
  for (const block of blocks) {
    if (!block.blockId) throw new Error('Every practice block needs an ID.');
    if (seenBlocks.has(block.blockId))
      throw new Error(`Duplicate practice block: ${block.blockId}`);
    seenBlocks.add(block.blockId);
    if (!Number.isInteger(block.requestedCount) || block.requestedCount < 1)
      throw new Error(`Invalid requested count for block ${block.blockId}.`);
    requestedTotal += block.requestedCount;
  }
  if (requestedTotal > 200)
    throw new Error('A practice session can contain at most 200 questions.');

  for (const candidate of candidates) {
    if (!seenBlocks.has(candidate.blockId))
      throw new Error(`Candidate references unknown block ${candidate.blockId}.`);
    if (
      !candidate.questionId ||
      !candidate.variantId ||
      !candidate.courseId
    ) {
      throw new Error('Every candidate needs question, variant and course IDs.');
    }
  }
}

function scarcityCompare(
  left: PracticeBlockRequest,
  right: PracticeBlockRequest,
  candidateCounts: Map<string, number>,
) {
  const leftCandidates = candidateCounts.get(left.blockId) || 0;
  const rightCandidates = candidateCounts.get(right.blockId) || 0;

  // Compare candidate/request ratios without floating-point ordering changes.
  const ratioDifference =
    leftCandidates * right.requestedCount -
    rightCandidates * left.requestedCount;
  return (
    ratioDifference ||
    leftCandidates - rightCandidates ||
    finiteNumber(left.sortOrder, Number.MAX_SAFE_INTEGER) -
      finiteNumber(right.sortOrder, Number.MAX_SAFE_INTEGER) ||
    compareText(left.blockId, right.blockId)
  );
}

/**
 * Allocates unique question cores across independently configured blocks.
 *
 * This is deterministic maximum-cardinality bipartite matching. Each requested
 * block quota becomes a slot; each question core can occupy at most one slot.
 * Augmenting paths can move an earlier allocation so a constrained later slot
 * is not starved by a greedy choice.
 */
export function allocatePracticeQuestions(
  blocks: PracticeBlockRequest[],
  candidates: PracticeCandidate[],
): PracticeAllocationResult {
  assertInputs(blocks, candidates);

  const blockById = new Map(blocks.map((block) => [block.blockId, block]));
  const choicesByBlock = new Map<string, Map<string, PracticeCandidate>>();
  const matchedBlocksByQuestion = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    const byQuestion = choicesByBlock.get(candidate.blockId) || new Map();
    const current = byQuestion.get(candidate.questionId);
    if (!current || compareCandidates(candidate, current) < 0)
      byQuestion.set(candidate.questionId, candidate);
    choicesByBlock.set(candidate.blockId, byQuestion);

    const matchedBlocks =
      matchedBlocksByQuestion.get(candidate.questionId) || new Set<string>();
    matchedBlocks.add(candidate.blockId);
    matchedBlocksByQuestion.set(candidate.questionId, matchedBlocks);
  }

  const candidateCounts = new Map(
    blocks.map((block) => [
      block.blockId,
      choicesByBlock.get(block.blockId)?.size || 0,
    ]),
  );
  const scarcityOrderedBlocks = [...blocks].sort((left, right) =>
    scarcityCompare(left, right, candidateCounts),
  );

  const slots: Slot[] = [];
  for (const block of scarcityOrderedBlocks) {
    for (let blockSlotIndex = 0; blockSlotIndex < block.requestedCount; blockSlotIndex += 1) {
      slots.push({
        index: slots.length,
        blockId: block.blockId,
        blockSlotIndex,
        blockSortOrder: finiteNumber(block.sortOrder, 0),
      });
    }
  }

  const questionToSlot = new Map<string, number>();
  const slotToCandidate = new Map<number, PracticeCandidate>();

  function tryAssign(
    slotIndex: number,
    visitedQuestions: Set<string>,
    visitedSlots: Set<number>,
  ): boolean {
    if (visitedSlots.has(slotIndex)) return false;
    visitedSlots.add(slotIndex);

    const slot = slots[slotIndex];
    const choices = [...(choicesByBlock.get(slot.blockId)?.values() || [])].sort(
      compareCandidates,
    );

    for (const choice of choices) {
      if (visitedQuestions.has(choice.questionId)) continue;
      visitedQuestions.add(choice.questionId);
      const occupiedSlot = questionToSlot.get(choice.questionId);

      if (
        occupiedSlot === undefined ||
        tryAssign(occupiedSlot, visitedQuestions, visitedSlots)
      ) {
        questionToSlot.set(choice.questionId, slotIndex);
        slotToCandidate.set(slotIndex, choice);
        return true;
      }
    }
    return false;
  }

  for (const slot of slots) {
    tryAssign(slot.index, new Set<string>(), new Set<number>());
  }

  const allocations: PracticeAllocation[] = [];
  for (const slot of slots) {
    const candidate = slotToCandidate.get(slot.index);
    if (!candidate) continue;
    allocations.push({
      ...candidate,
      slotIndex: slot.index,
      blockSlotIndex: slot.blockSlotIndex,
      blockSortOrder: slot.blockSortOrder,
      matchedBlockIds: [
        ...(matchedBlocksByQuestion.get(candidate.questionId) || []),
      ].sort(compareText),
    });
  }

  const allocatedByBlock = new Map<string, number>();
  for (const allocation of allocations) {
    allocatedByBlock.set(
      allocation.blockId,
      (allocatedByBlock.get(allocation.blockId) || 0) + 1,
    );
  }

  const shortages = blocks
    .map((block): PracticeBlockShortage => {
      const allocatedCount = allocatedByBlock.get(block.blockId) || 0;
      return {
        blockId: block.blockId,
        requestedCount: block.requestedCount,
        allocatedCount,
        shortage: block.requestedCount - allocatedCount,
        candidateCount: candidateCounts.get(block.blockId) || 0,
      };
    })
    .filter((shortage) => shortage.shortage > 0)
    .sort((left, right) => {
      const leftBlock = blockById.get(left.blockId)!;
      const rightBlock = blockById.get(right.blockId)!;
      return (
        finiteNumber(leftBlock.sortOrder, 0) -
          finiteNumber(rightBlock.sortOrder, 0) ||
        compareText(left.blockId, right.blockId)
      );
    });

  return {
    requestedCount: blocks.reduce(
      (total, block) => total + block.requestedCount,
      0,
    ),
    allocatedCount: allocations.length,
    allocations,
    shortages,
  };
}

function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function orderPracticeAllocations(
  allocations: PracticeAllocation[],
  mode: PracticeOrderingMode,
  seed: string,
) {
  const ordered = [...allocations];

  if (mode === 'mixed') {
    const random = seededRandom(seed);
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [ordered[index], ordered[swapIndex]] = [
        ordered[swapIndex],
        ordered[index],
      ];
    }
    return ordered;
  }

  return ordered.sort((left, right) => {
    if (mode === 'interleaved') {
      return (
        left.blockSlotIndex - right.blockSlotIndex ||
        left.blockSortOrder - right.blockSortOrder ||
        compareText(left.blockId, right.blockId) ||
        compareText(left.questionId, right.questionId)
      );
    }
    if (mode === 'easier_to_harder') {
      return (
        finiteNumber(left.difficultyRank, Number.MAX_SAFE_INTEGER) -
          finiteNumber(right.difficultyRank, Number.MAX_SAFE_INTEGER) ||
        left.blockSortOrder - right.blockSortOrder ||
        finiteNumber(left.stableOrder, Number.MAX_SAFE_INTEGER) -
          finiteNumber(right.stableOrder, Number.MAX_SAFE_INTEGER) ||
        compareText(left.questionId, right.questionId)
      );
    }
    if (mode === 'source_order') {
      return (
        finiteNumber(left.stableOrder, Number.MAX_SAFE_INTEGER) -
          finiteNumber(right.stableOrder, Number.MAX_SAFE_INTEGER) ||
        left.blockSortOrder - right.blockSortOrder ||
        compareText(left.questionId, right.questionId)
      );
    }
    return (
      left.blockSortOrder - right.blockSortOrder ||
      left.blockSlotIndex - right.blockSlotIndex ||
      compareText(left.questionId, right.questionId)
    );
  });
}

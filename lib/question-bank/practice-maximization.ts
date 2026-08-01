import type { PracticeCandidate } from './practice-allocation';

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

function finiteNumber(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right);
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

/**
 * Finds a fair maximum-cardinality set of unique question cores.
 *
 * Every round gives each block one opportunity to gain a question. The
 * augmenting-path search can move already assigned questions between blocks,
 * so a broad block cannot permanently consume a question needed by a narrower
 * block. The resulting per-block counts are guaranteed to be jointly feasible
 * and can safely be copied back into the normal practice configuration.
 */
export function maximizePracticeBlockCounts(
  blocks: PracticeMaximumBlock[],
  candidates: PracticeCandidate[],
): PracticeMaximumResult {
  if (!blocks.length) throw new Error('At least one practice block is required.');

  const blockById = new Map(blocks.map((block) => [block.blockId, block]));
  if (blockById.size !== blocks.length)
    throw new Error('Practice block IDs must be unique.');

  const choicesByBlock = new Map<string, Map<string, PracticeCandidate>>();
  for (const candidate of candidates) {
    if (!blockById.has(candidate.blockId))
      throw new Error(`Candidate references unknown block ${candidate.blockId}.`);
    const choices = choicesByBlock.get(candidate.blockId) || new Map();
    const current = choices.get(candidate.questionId);
    if (!current || compareCandidates(candidate, current) < 0)
      choices.set(candidate.questionId, candidate);
    choicesByBlock.set(candidate.blockId, choices);
  }

  const orderedChoices = new Map(
    blocks.map((block) => [
      block.blockId,
      [...(choicesByBlock.get(block.blockId)?.values() || [])].sort(
        compareCandidates,
      ),
    ]),
  );
  const questionOwner = new Map<string, string>();
  const questionsByBlock = new Map(
    blocks.map((block) => [block.blockId, new Set<string>()]),
  );

  function augment(
    blockId: string,
    visitedBlocks: Set<string>,
    visitedQuestions: Set<string>,
  ): boolean {
    if (visitedBlocks.has(blockId)) return false;
    visitedBlocks.add(blockId);

    for (const candidate of orderedChoices.get(blockId) || []) {
      const questionId = candidate.questionId;
      if (visitedQuestions.has(questionId)) continue;
      visitedQuestions.add(questionId);

      const owner = questionOwner.get(questionId);
      if (!owner) {
        questionOwner.set(questionId, blockId);
        questionsByBlock.get(blockId)!.add(questionId);
        return true;
      }
      if (owner === blockId) continue;

      if (augment(owner, visitedBlocks, visitedQuestions)) {
        questionsByBlock.get(owner)!.delete(questionId);
        questionsByBlock.get(blockId)!.add(questionId);
        questionOwner.set(questionId, blockId);
        return true;
      }
    }
    return false;
  }

  while (true) {
    let gainedThisRound = false;
    const roundOrder = [...blocks].sort((left, right) => {
      const leftAllocated = questionsByBlock.get(left.blockId)!.size;
      const rightAllocated = questionsByBlock.get(right.blockId)!.size;
      const leftCandidates = orderedChoices.get(left.blockId)?.length || 0;
      const rightCandidates = orderedChoices.get(right.blockId)?.length || 0;
      return (
        leftAllocated - rightAllocated ||
        leftCandidates - rightCandidates ||
        finiteNumber(left.sortOrder, Number.MAX_SAFE_INTEGER) -
          finiteNumber(right.sortOrder, Number.MAX_SAFE_INTEGER) ||
        compareText(left.blockId, right.blockId)
      );
    });

    for (const block of roundOrder) {
      const allocated = questionsByBlock.get(block.blockId)!.size;
      const candidateCount = orderedChoices.get(block.blockId)?.length || 0;
      if (allocated >= candidateCount) continue;
      if (augment(block.blockId, new Set(), new Set())) gainedThisRound = true;
    }

    if (!gainedThisRound) break;
  }

  return {
    totalUniqueAllocated: questionOwner.size,
    blocks: blocks.map((block) => ({
      blockId: block.blockId,
      candidateCount: orderedChoices.get(block.blockId)?.length || 0,
      recommendedCount: questionsByBlock.get(block.blockId)?.size || 0,
    })),
  };
}

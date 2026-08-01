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

type FlowEdge = {
  to: number;
  reverseIndex: number;
  capacity: number;
};

type AssignmentEdge = {
  blockId: string;
  questionId: string;
  candidate: PracticeCandidate;
  edge: FlowEdge;
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

  const seenBlocks = new Set<string>();
  for (const block of blocks) {
    if (!block.blockId) throw new Error('Every practice block needs an ID.');
    if (seenBlocks.has(block.blockId))
      throw new Error(`Duplicate practice block: ${block.blockId}`);
    seenBlocks.add(block.blockId);
    if (!Number.isInteger(block.requestedCount) || block.requestedCount < 1)
      throw new Error(`Invalid requested count for block ${block.blockId}.`);
  }

  for (const candidate of candidates) {
    if (!seenBlocks.has(candidate.blockId))
      throw new Error(`Candidate references unknown block ${candidate.blockId}.`);
    if (!candidate.questionId || !candidate.variantId || !candidate.courseId)
      throw new Error('Every candidate needs question, variant and course IDs.');
  }
}

function scarcityCompare(
  left: PracticeBlockRequest,
  right: PracticeBlockRequest,
  candidateCounts: Map<string, number>,
) {
  const leftCandidates = candidateCounts.get(left.blockId) || 0;
  const rightCandidates = candidateCounts.get(right.blockId) || 0;
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

function addFlowEdge(graph: FlowEdge[][], from: number, to: number, capacity: number) {
  const forward: FlowEdge = {
    to,
    reverseIndex: graph[to].length,
    capacity,
  };
  const reverse: FlowEdge = {
    to: from,
    reverseIndex: graph[from].length,
    capacity: 0,
  };
  graph[from].push(forward);
  graph[to].push(reverse);
  return forward;
}

/**
 * Allocates unique question cores across independently configured blocks.
 *
 * The original first-release allocator expanded every requested question into a
 * separate slot. That was exact but became expensive for queues above a few
 * hundred questions. This implementation models each block as one capacitated
 * node and each unique question as one unit-capacity node, then runs Dinic's
 * maximum-flow algorithm. It remains deterministic, overlap-safe and maximum
 * cardinality while scaling to thousands of requested questions.
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
  const questionIds = [...matchedBlocksByQuestion.keys()].sort(compareText);

  const source = 0;
  const firstBlockNode = 1;
  const firstQuestionNode = firstBlockNode + scarcityOrderedBlocks.length;
  const sink = firstQuestionNode + questionIds.length;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const blockNodeById = new Map<string, number>();
  const questionNodeById = new Map<string, number>();

  scarcityOrderedBlocks.forEach((block, index) => {
    const node = firstBlockNode + index;
    blockNodeById.set(block.blockId, node);
    addFlowEdge(graph, source, node, block.requestedCount);
  });
  questionIds.forEach((questionId, index) => {
    const node = firstQuestionNode + index;
    questionNodeById.set(questionId, node);
    addFlowEdge(graph, node, sink, 1);
  });

  const assignmentEdges: AssignmentEdge[] = [];
  for (const block of scarcityOrderedBlocks) {
    const blockNode = blockNodeById.get(block.blockId)!;
    const choices = [...(choicesByBlock.get(block.blockId)?.values() || [])].sort(
      compareCandidates,
    );
    for (const candidate of choices) {
      const edge = addFlowEdge(
        graph,
        blockNode,
        questionNodeById.get(candidate.questionId)!,
        1,
      );
      assignmentEdges.push({
        blockId: block.blockId,
        questionId: candidate.questionId,
        candidate,
        edge,
      });
    }
  }

  const levels = new Int32Array(graph.length);
  const nextEdge = new Int32Array(graph.length);

  function buildLevels() {
    levels.fill(-1);
    levels[source] = 0;
    const queue = new Int32Array(graph.length);
    let head = 0;
    let tail = 0;
    queue[tail++] = source;
    while (head < tail) {
      const node = queue[head++];
      for (const edge of graph[node]) {
        if (edge.capacity <= 0 || levels[edge.to] >= 0) continue;
        levels[edge.to] = levels[node] + 1;
        queue[tail++] = edge.to;
      }
    }
    return levels[sink] >= 0;
  }

  function sendFlow(node: number, incoming: number): number {
    if (node === sink) return incoming;
    for (
      let index = nextEdge[node];
      index < graph[node].length;
      index += 1, nextEdge[node] = index
    ) {
      const edge = graph[node][index];
      if (edge.capacity <= 0 || levels[edge.to] !== levels[node] + 1) continue;
      const sent = sendFlow(edge.to, Math.min(incoming, edge.capacity));
      if (sent <= 0) continue;
      edge.capacity -= sent;
      graph[edge.to][edge.reverseIndex].capacity += sent;
      return sent;
    }
    return 0;
  }

  let allocatedCount = 0;
  while (buildLevels()) {
    nextEdge.fill(0);
    while (true) {
      const sent = sendFlow(source, Number.MAX_SAFE_INTEGER);
      if (!sent) break;
      allocatedCount += sent;
    }
  }

  const selectedByBlock = new Map<string, PracticeCandidate[]>();
  for (const assignment of assignmentEdges) {
    if (assignment.edge.capacity !== 0) continue;
    const selected = selectedByBlock.get(assignment.blockId) || [];
    selected.push(assignment.candidate);
    selectedByBlock.set(assignment.blockId, selected);
  }

  const allocations: PracticeAllocation[] = [];
  const originalOrder = [...blocks].sort(
    (left, right) =>
      finiteNumber(left.sortOrder, 0) - finiteNumber(right.sortOrder, 0) ||
      compareText(left.blockId, right.blockId),
  );
  for (const block of originalOrder) {
    const selected = [...(selectedByBlock.get(block.blockId) || [])].sort(
      compareCandidates,
    );
    selected.forEach((candidate, blockSlotIndex) => {
      allocations.push({
        ...candidate,
        slotIndex: allocations.length,
        blockSlotIndex,
        blockSortOrder: finiteNumber(block.sortOrder, 0),
        matchedBlockIds: [
          ...(matchedBlocksByQuestion.get(candidate.questionId) || []),
        ].sort(compareText),
      });
    });
  }

  const shortages = originalOrder
    .map((block): PracticeBlockShortage => {
      const blockAllocated = selectedByBlock.get(block.blockId)?.length || 0;
      return {
        blockId: block.blockId,
        requestedCount: block.requestedCount,
        allocatedCount: blockAllocated,
        shortage: block.requestedCount - blockAllocated,
        candidateCount: candidateCounts.get(block.blockId) || 0,
      };
    })
    .filter((shortage) => shortage.shortage > 0);

  return {
    requestedCount: blocks.reduce(
      (total, block) => total + block.requestedCount,
      0,
    ),
    allocatedCount,
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

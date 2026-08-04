import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';

import {
  allocatePracticeQuestions,
  orderPracticeAllocations,
  type PracticeCandidate,
  type PracticeAllocationResult,
} from './practice-allocation';
import {
  stablePracticeConfiguration,
  type PracticeConfiguration,
  type PracticeConfigurationBlock,
} from './practice-configuration';
import { maximizePracticeBlockCounts } from './practice-maximization';

type CandidateTuple = [
  blockKey: string,
  questionId: string,
  variantId: string,
  courseId: string,
  coursePriority: number | string | null,
  variantPriority: number | string | null,
  difficultyRank: number | string | null,
  stableOrder: number | string | null,
];

type CandidatePayloadRow = {
  payload: CandidateTuple[] | null;
};

export type PracticePreviewBlock = {
  key: string;
  requestedCount: number;
  candidateCount: number;
  allocatedCount: number;
  shortage: number;
  overlapQuestionCount: number;
};

export type PracticePreviewGroupRequest = {
  key: string;
  blockKeys: string[];
};

export type PracticePreviewGroup = {
  key: string;
  allocatedCount: number;
  totalUniqueAvailable: number;
};

export type PracticePreview = {
  requestedCount: number;
  allocatedCount: number;
  totalUniqueAvailable: number;
  overlappingQuestionCount: number;
  feasible: boolean;
  blocks: PracticePreviewBlock[];
  groups: PracticePreviewGroup[];
};

export type PracticeMaximumPreview = {
  totalUniqueAllocated: number;
  blocks: Array<{
    key: string;
    candidateCount: number;
    recommendedCount: number;
  }>;
};

export class PracticeConfigurationShortageError extends Error {
  preview: PracticePreview;

  constructor(preview: PracticePreview) {
    super('The selected practice configuration cannot fill every requested block.');
    this.name = 'PracticeConfigurationShortageError';
    this.preview = preview;
  }
}

export const PRACTICE_SESSION_BUILD_BATCH_SIZE = 1_000;

export type PreparedPracticeSession = {
  configuration: PracticeConfiguration;
  configurationHash: string;
  preview: PracticePreview;
  allocation: PracticeAllocationResult;
};

export type PracticeSessionBuildState = {
  sessionId: string;
  generationSeed: string;
  processedCount: number;
  totalCount: number;
  status: 'building' | 'complete';
};

function number(value: number | string | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadCandidates(
  userId: string,
  configuration: PracticeConfiguration,
) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc('dp_qb_practice_candidate_payload', {
    p_user_id: userId,
    p_configuration: configuration,
  });
  if (error) throw new Error(`Unable to resolve practice candidates: ${error.message}`);

  const payload = ((data || []) as CandidatePayloadRow[])[0]?.payload || [];
  if (!Array.isArray(payload))
    throw new Error('Unable to resolve practice candidates: invalid payload.');

  return payload.map((row, index): PracticeCandidate => {
    if (!Array.isArray(row) || row.length !== 8)
      throw new Error(
        `Unable to resolve practice candidates: invalid row ${index + 1}.`,
      );
    const [
      blockKey,
      questionId,
      variantId,
      courseId,
      coursePriority,
      variantPriority,
      difficultyRank,
      stableOrder,
    ] = row;
    if (!blockKey || !questionId || !variantId || !courseId)
      throw new Error(
        `Unable to resolve practice candidates: incomplete row ${index + 1}.`,
      );
    return {
      blockId: blockKey,
      questionId,
      variantId,
      courseId,
      coursePriority: number(coursePriority, Number.MAX_SAFE_INTEGER),
      variantPriority: number(variantPriority, Number.MAX_SAFE_INTEGER),
      difficultyRank: number(difficultyRank, Number.MAX_SAFE_INTEGER),
      stableOrder: number(stableOrder, Number.MAX_SAFE_INTEGER),
    };
  });
}

function blockSnapshot(block: PracticeConfigurationBlock) {
  return {
    key: block.key,
    selectionType: block.selectionType,
    requestedCount: block.requestedCount,
    ...(block.selectionType === 'concept'
      ? {
          conceptId: block.conceptId,
          conceptIds: block.conceptIds?.length
            ? block.conceptIds
            : [block.conceptId],
          courseIds: block.courseIds,
        }
      : { courseId: block.courseId }),
    filters: block.filters,
  };
}

export function createPracticePreview(
  configuration: PracticeConfiguration,
  candidates: PracticeCandidate[],
  groups: PracticePreviewGroupRequest[] = [],
) {
  const blocks = configuration.blocks.map((block, index) => ({
    blockId: block.key,
    requestedCount: block.requestedCount,
    sortOrder: index,
  }));
  const allocation = allocatePracticeQuestions(blocks, candidates);

  const questionsByBlock = new Map<string, Set<string>>();
  const blocksByQuestion = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const blockQuestions = questionsByBlock.get(candidate.blockId) || new Set<string>();
    blockQuestions.add(candidate.questionId);
    questionsByBlock.set(candidate.blockId, blockQuestions);

    const questionBlocks = blocksByQuestion.get(candidate.questionId) || new Set<string>();
    questionBlocks.add(candidate.blockId);
    blocksByQuestion.set(candidate.questionId, questionBlocks);
  }

  const allocatedByBlock = new Map<string, number>();
  for (const item of allocation.allocations) {
    allocatedByBlock.set(
      item.blockId,
      (allocatedByBlock.get(item.blockId) || 0) + 1,
    );
  }

  const shortageByBlock = new Map(
    allocation.shortages.map((shortage) => [shortage.blockId, shortage.shortage]),
  );
  const previewBlocks: PracticePreviewBlock[] = configuration.blocks.map((block) => {
    const blockQuestions = questionsByBlock.get(block.key) || new Set<string>();
    const overlapQuestionCount = [...blockQuestions].filter(
      (questionId) => (blocksByQuestion.get(questionId)?.size || 0) > 1,
    ).length;
    return {
      key: block.key,
      requestedCount: block.requestedCount,
      candidateCount: blockQuestions.size,
      allocatedCount: allocatedByBlock.get(block.key) || 0,
      shortage: shortageByBlock.get(block.key) || 0,
      overlapQuestionCount,
    };
  });

  const groupKeyByBlock = new Map(
    groups.flatMap((group) =>
      group.blockKeys.map((blockKey) => [blockKey, group.key] as const),
    ),
  );
  const questionsByGroup = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const groupKey = groupKeyByBlock.get(candidate.blockId);
    if (!groupKey) continue;
    const questions = questionsByGroup.get(groupKey) || new Set<string>();
    questions.add(candidate.questionId);
    questionsByGroup.set(groupKey, questions);
  }
  const allocatedByGroup = new Map<string, number>();
  for (const item of allocation.allocations) {
    const groupKey = groupKeyByBlock.get(item.blockId);
    if (!groupKey) continue;
    allocatedByGroup.set(
      groupKey,
      (allocatedByGroup.get(groupKey) || 0) + 1,
    );
  }

  const preview: PracticePreview = {
    requestedCount: allocation.requestedCount,
    allocatedCount: allocation.allocatedCount,
    totalUniqueAvailable: blocksByQuestion.size,
    overlappingQuestionCount: [...blocksByQuestion.values()].filter(
      (matchedBlocks) => matchedBlocks.size > 1,
    ).length,
    feasible: allocation.shortages.length === 0,
    blocks: previewBlocks,
    groups: groups.map((group) => ({
      key: group.key,
      allocatedCount: allocatedByGroup.get(group.key) || 0,
      totalUniqueAvailable: questionsByGroup.get(group.key)?.size || 0,
    })),
  };

  return { preview, allocation };
}

export async function previewPracticeConfiguration(
  userId: string,
  configuration: PracticeConfiguration,
  groups: PracticePreviewGroupRequest[] = [],
) {
  const candidates = await loadCandidates(userId, configuration);
  return createPracticePreview(configuration, candidates, groups).preview;
}

export async function maximizePracticeConfiguration(
  userId: string,
  configuration: PracticeConfiguration,
): Promise<PracticeMaximumPreview> {
  const normalized = stablePracticeConfiguration(configuration);
  const candidates = await loadCandidates(userId, normalized);
  const maximum = maximizePracticeBlockCounts(
    normalized.blocks.map((block, index) => ({
      blockId: block.key,
      sortOrder: index,
    })),
    candidates,
  );

  return {
    totalUniqueAllocated: maximum.totalUniqueAllocated,
    blocks: maximum.blocks.map((block) => ({
      key: block.blockId,
      candidateCount: block.candidateCount,
      recommendedCount: block.recommendedCount,
    })),
  };
}

export async function preparePracticeSession(
  userId: string,
  configuration: PracticeConfiguration,
): Promise<PreparedPracticeSession> {
  const normalized = stablePracticeConfiguration(configuration);
  const candidates = await loadCandidates(userId, normalized);
  const { preview, allocation } = createPracticePreview(normalized, candidates);
  if (!preview.feasible) throw new PracticeConfigurationShortageError(preview);
  const configurationJson = JSON.stringify(normalized);
  const configurationHash = createHash('sha256')
    .update(configurationJson)
    .digest('hex');

  return {
    configuration: normalized,
    configurationHash,
    preview,
    allocation,
  };
}

export function practiceSessionItems(
  prepared: PreparedPracticeSession,
  seed: string,
) {
  const ordered = orderPracticeAllocations(
    prepared.allocation.allocations,
    prepared.configuration.orderingMode,
    seed,
  );
  const blockByKey = new Map(
    prepared.configuration.blocks.map((block) => [block.key, block]),
  );

  return ordered.map((allocationItem, position) => {
    const primaryBlock = blockByKey.get(allocationItem.blockId);
    if (!primaryBlock)
      throw new Error(`Allocated practice block ${allocationItem.blockId} is missing.`);
    const matches = allocationItem.matchedBlockIds.map((blockKey) => {
      const block = blockByKey.get(blockKey);
      if (!block) throw new Error(`Matched practice block ${blockKey} is missing.`);
      return {
        blockKey,
        ...(block.selectionType === 'concept'
          ? {
              conceptId: block.conceptId,
              conceptIds: block.conceptIds?.length
                ? block.conceptIds
                : [block.conceptId],
            }
          : {}),
        selectionType: block.selectionType,
      };
    });
    return {
      position,
      primaryBlockKey: allocationItem.blockId,
      primaryBlockSnapshot: blockSnapshot(primaryBlock),
      questionId: allocationItem.questionId,
      variantId: allocationItem.variantId,
      matches,
    };
  });
}

function practiceBuildState(data: unknown): PracticeSessionBuildState {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Practice session build state was not returned.');
  const row = data as Record<string, unknown>;
  const sessionId = typeof row.sessionId === 'string' ? row.sessionId : '';
  const generationSeed =
    typeof row.generationSeed === 'string' ? row.generationSeed : '';
  const processedCount = Number(row.processedCount);
  const totalCount = Number(row.totalCount);
  const status = row.status;
  if (
    !sessionId ||
    !generationSeed ||
    !Number.isInteger(processedCount) ||
    processedCount < 0 ||
    !Number.isInteger(totalCount) ||
    totalCount < 1 ||
    processedCount > totalCount ||
    (status !== 'building' && status !== 'complete')
  )
    throw new Error('Practice session build state was invalid.');
  return {
    sessionId,
    generationSeed,
    processedCount,
    totalCount,
    status,
  };
}

export async function beginPracticeSessionBuild({
  userId,
  requestId,
  prepared,
  proposedSeed = randomBytes(16).toString('hex'),
}: {
  userId: string;
  requestId: string;
  prepared: PreparedPracticeSession;
  proposedSeed?: string;
}) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc('dp_qb_begin_practice_session_build', {
    p_user_id: userId,
    p_client_request_id: requestId,
    p_configuration: prepared.configuration,
    p_generation_seed: proposedSeed,
    p_configuration_hash: prepared.configurationHash,
    p_ordering_mode: prepared.configuration.orderingMode,
    p_total_count: prepared.allocation.allocatedCount,
  });
  if (error) throw new Error(`Unable to begin practice session: ${error.message}`);
  return practiceBuildState(data);
}

export async function appendPracticeSessionBuildBatch({
  userId,
  configurationHash,
  state,
  items,
}: {
  userId: string;
  configurationHash: string;
  state: PracticeSessionBuildState;
  items: ReturnType<typeof practiceSessionItems>;
}) {
  const batch = items.slice(
    state.processedCount,
    state.processedCount + PRACTICE_SESSION_BUILD_BATCH_SIZE,
  );
  if (!batch.length) {
    if (state.status === 'complete') return state;
    throw new Error('Practice session build has no remaining batch.');
  }

  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc('dp_qb_append_practice_session_batch', {
    p_user_id: userId,
    p_session_id: state.sessionId,
    p_configuration_hash: configurationHash,
    p_start_position: state.processedCount,
    p_items: batch,
  });
  if (error) throw new Error(`Unable to extend practice session: ${error.message}`);
  return practiceBuildState(data);
}

export async function generatePracticeSession(
  userId: string,
  configuration: PracticeConfiguration,
  requestId = randomUUID(),
) {
  const prepared = await preparePracticeSession(userId, configuration);
  let state = await beginPracticeSessionBuild({ userId, requestId, prepared });
  const items = practiceSessionItems(prepared, state.generationSeed);
  while (state.status !== 'complete') {
    state = await appendPracticeSessionBuildBatch({
      userId,
      configurationHash: prepared.configurationHash,
      state,
      items,
    });
  }
  return { sessionId: state.sessionId, preview: prepared.preview };
}

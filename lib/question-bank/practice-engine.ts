import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { createSupabaseAdminClient } from '@/lib/supabase-admin';

import {
  allocatePracticeQuestions,
  orderPracticeAllocations,
  type PracticeCandidate,
} from './practice-allocation';
import {
  stablePracticeConfiguration,
  type PracticeConfiguration,
  type PracticeConfigurationBlock,
} from './practice-configuration';

type CandidateRow = {
  block_key: string;
  question_id: string;
  variant_id: string;
  course_id: string;
  course_priority: number | string | null;
  variant_priority: number | string | null;
  difficulty_rank: number | string | null;
  stable_order: number | string | null;
};

export type PracticePreviewBlock = {
  key: string;
  requestedCount: number;
  candidateCount: number;
  allocatedCount: number;
  shortage: number;
  overlapQuestionCount: number;
};

export type PracticePreview = {
  requestedCount: number;
  allocatedCount: number;
  totalUniqueAvailable: number;
  overlappingQuestionCount: number;
  feasible: boolean;
  blocks: PracticePreviewBlock[];
};

export class PracticeConfigurationShortageError extends Error {
  preview: PracticePreview;

  constructor(preview: PracticePreview) {
    super('The selected practice configuration cannot fill every requested block.');
    this.name = 'PracticeConfigurationShortageError';
    this.preview = preview;
  }
}

function number(value: number | string | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadCandidates(
  userId: string,
  configuration: PracticeConfiguration,
) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc('dp_qb_practice_candidates', {
    p_user_id: userId,
    p_configuration: configuration,
  });
  if (error) throw new Error(`Unable to resolve practice candidates: ${error.message}`);

  return ((data || []) as CandidateRow[]).map(
    (row): PracticeCandidate => ({
      blockId: row.block_key,
      questionId: row.question_id,
      variantId: row.variant_id,
      courseId: row.course_id,
      coursePriority: number(row.course_priority, Number.MAX_SAFE_INTEGER),
      variantPriority: number(row.variant_priority, Number.MAX_SAFE_INTEGER),
      difficultyRank: number(row.difficulty_rank, Number.MAX_SAFE_INTEGER),
      stableOrder: number(row.stable_order, Number.MAX_SAFE_INTEGER),
    }),
  );
}

function blockSnapshot(block: PracticeConfigurationBlock) {
  return {
    key: block.key,
    selectionType: block.selectionType,
    requestedCount: block.requestedCount,
    ...(block.selectionType === 'concept'
      ? { conceptId: block.conceptId, courseIds: block.courseIds }
      : { courseId: block.courseId }),
    filters: block.filters,
  };
}

function createPreview(
  configuration: PracticeConfiguration,
  candidates: PracticeCandidate[],
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

  const preview: PracticePreview = {
    requestedCount: allocation.requestedCount,
    allocatedCount: allocation.allocatedCount,
    totalUniqueAvailable: blocksByQuestion.size,
    overlappingQuestionCount: [...blocksByQuestion.values()].filter(
      (matchedBlocks) => matchedBlocks.size > 1,
    ).length,
    feasible: allocation.shortages.length === 0,
    blocks: previewBlocks,
  };

  return { preview, allocation };
}

export async function previewPracticeConfiguration(
  userId: string,
  configuration: PracticeConfiguration,
) {
  const candidates = await loadCandidates(userId, configuration);
  return createPreview(configuration, candidates).preview;
}

export async function generatePracticeSession(
  userId: string,
  configuration: PracticeConfiguration,
) {
  const normalized = stablePracticeConfiguration(configuration);
  const candidates = await loadCandidates(userId, normalized);
  const { preview, allocation } = createPreview(normalized, candidates);
  if (!preview.feasible) throw new PracticeConfigurationShortageError(preview);

  const seed = randomBytes(16).toString('hex');
  const ordered = orderPracticeAllocations(
    allocation.allocations,
    normalized.orderingMode,
    seed,
  );
  const blockByKey = new Map(normalized.blocks.map((block) => [block.key, block]));
  const configurationJson = JSON.stringify(normalized);
  const configurationHash = createHash('sha256')
    .update(configurationJson)
    .digest('hex');

  const items = ordered.map((allocationItem, position) => {
    const primaryBlock = blockByKey.get(allocationItem.blockId);
    if (!primaryBlock)
      throw new Error(`Allocated practice block ${allocationItem.blockId} is missing.`);
    const matches = allocationItem.matchedBlockIds.map((blockKey) => {
      const block = blockByKey.get(blockKey);
      if (!block) throw new Error(`Matched practice block ${blockKey} is missing.`);
      return {
        blockKey,
        ...(block.selectionType === 'concept'
          ? { conceptId: block.conceptId }
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

  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc('dp_qb_create_practice_session', {
    p_user_id: userId,
    p_configuration: normalized,
    p_generation_seed: seed,
    p_configuration_hash: configurationHash,
    p_ordering_mode: normalized.orderingMode,
    p_items: items,
  });
  if (error) throw new Error(`Unable to create practice session: ${error.message}`);
  if (typeof data !== 'string') throw new Error('Practice session ID was not returned.');

  return { sessionId: data, preview };
}

import type { PracticeOrderingMode } from './practice-allocation';

export type PracticeProgressStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed';

export type PracticeFilters = {
  difficulties: Array<'easy' | 'medium' | 'hard' | 'unrated'>;
  statuses: PracticeProgressStatus[];
  saved: boolean | null;
  calculator: boolean | null;
};

export type PracticeConceptBlock = {
  key: string;
  selectionType: 'concept';
  conceptId: string;
  courseIds: string[];
  requestedCount: number;
  filters: Partial<PracticeFilters>;
};

export type PracticeCourseBlock = {
  key: string;
  selectionType: 'course';
  courseId: string;
  requestedCount: number;
  filters: Partial<PracticeFilters>;
};

export type PracticeConfigurationBlock =
  | PracticeConceptBlock
  | PracticeCourseBlock;

export type PracticeConfiguration = {
  schemaVersion: 1;
  orderingMode: PracticeOrderingMode;
  filters: PracticeFilters;
  blocks: PracticeConfigurationBlock[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'unrated']);
const STATUSES = new Set(['not_started', 'in_progress', 'completed']);
const ORDERING_MODES = new Set<PracticeOrderingMode>([
  'mixed',
  'grouped',
  'interleaved',
  'easier_to_harder',
  'source_order',
]);
const POSTGRES_INTEGER_MAXIMUM = 2_147_483_647;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new Error(`${label} must be a valid UUID.`);
  return value;
}

function key(value: unknown, label: string) {
  if (typeof value !== 'string' || !KEY.test(value))
    throw new Error(`${label} must use lowercase kebab-case.`);
  return value;
}

function count(value: unknown, label: string) {
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > POSTGRES_INTEGER_MAXIMUM
  )
    throw new Error(`${label} must be a positive whole number.`);
  return parsed;
}

function uniqueValues<T extends string>(
  value: unknown,
  allowed: Set<string>,
  label: string,
): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item))
      throw new Error(`${label} contains an invalid value.`);
    if (!seen.has(item)) result.push(item as T);
    seen.add(item);
  }
  return result;
}

function nullableBoolean(value: unknown, label: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'boolean')
    throw new Error(`${label} must be true, false or null.`);
  return value;
}

function parseFilters(
  value: unknown,
  defaults: PracticeFilters,
  label: string,
): PracticeFilters {
  const row = value === undefined ? {} : object(value, label);
  return {
    difficulties:
      row.difficulties === undefined
        ? defaults.difficulties
        : uniqueValues<PracticeFilters['difficulties'][number]>(
            row.difficulties,
            DIFFICULTIES,
            `${label}.difficulties`,
          ),
    statuses:
      row.statuses === undefined
        ? defaults.statuses
        : uniqueValues<PracticeProgressStatus>(
            row.statuses,
            STATUSES,
            `${label}.statuses`,
          ),
    saved:
      row.saved === undefined
        ? defaults.saved
        : nullableBoolean(row.saved, `${label}.saved`),
    calculator:
      row.calculator === undefined
        ? defaults.calculator
        : nullableBoolean(row.calculator, `${label}.calculator`),
  };
}

export function parsePracticeConfiguration(value: unknown): PracticeConfiguration {
  const root = object(value, 'Practice configuration');
  const schemaVersion = Number(root.schemaVersion ?? 1);
  if (schemaVersion !== 1)
    throw new Error('Unsupported practice configuration schema version.');

  const orderingMode = String(root.orderingMode || 'interleaved') as PracticeOrderingMode;
  if (!ORDERING_MODES.has(orderingMode))
    throw new Error('Invalid practice ordering mode.');

  const defaultFilters: PracticeFilters = {
    difficulties: ['easy', 'medium', 'hard', 'unrated'],
    statuses: ['not_started', 'in_progress', 'completed'],
    saved: null,
    calculator: null,
  };
  const filters = parseFilters(root.filters, defaultFilters, 'filters');

  if (!Array.isArray(root.blocks) || !root.blocks.length)
    throw new Error('At least one practice block is required.');

  const blockKeys = new Set<string>();
  let requestedTotal = 0;
  const blocks = root.blocks.map((rawBlock, index): PracticeConfigurationBlock => {
    const row = object(rawBlock, `blocks[${index}]`);
    const blockKey = key(row.key, `blocks[${index}].key`);
    if (blockKeys.has(blockKey))
      throw new Error(`Duplicate practice block key: ${blockKey}.`);
    blockKeys.add(blockKey);
    const requestedCount = count(
      row.requestedCount,
      `blocks[${index}].requestedCount`,
    );
    requestedTotal += requestedCount;
    if (requestedTotal > POSTGRES_INTEGER_MAXIMUM)
      throw new Error('The requested practice total is too large to store.');
    const selectionType = String(row.selectionType || '');
    const blockFilters = parseFilters(
      row.filters,
      filters,
      `blocks[${index}].filters`,
    );

    if (selectionType === 'concept') {
      if (!Array.isArray(row.courseIds) || !row.courseIds.length)
        throw new Error(`blocks[${index}].courseIds cannot be empty.`);
      if (row.courseIds.length > 10)
        throw new Error('A concept block can select at most 10 courses.');
      const courseIds = [
        ...new Set(
          row.courseIds.map((item, courseIndex) =>
            uuid(item, `blocks[${index}].courseIds[${courseIndex}]`),
          ),
        ),
      ];
      return {
        key: blockKey,
        selectionType,
        conceptId: uuid(row.conceptId, `blocks[${index}].conceptId`),
        courseIds,
        requestedCount,
        filters: blockFilters,
      };
    }

    if (selectionType === 'course') {
      return {
        key: blockKey,
        selectionType,
        courseId: uuid(row.courseId, `blocks[${index}].courseId`),
        requestedCount,
        filters: blockFilters,
      };
    }

    throw new Error(`blocks[${index}].selectionType is invalid.`);
  });

  return {
    schemaVersion: 1,
    orderingMode,
    filters,
    blocks,
  };
}

export function stablePracticeConfiguration(
  configuration: PracticeConfiguration,
): PracticeConfiguration {
  return {
    ...configuration,
    filters: {
      ...configuration.filters,
      difficulties: [...configuration.filters.difficulties].sort(),
      statuses: [...configuration.filters.statuses].sort(),
    },
    blocks: configuration.blocks.map((block) => ({
      ...block,
      ...(block.selectionType === 'concept'
        ? { courseIds: [...block.courseIds] }
        : {}),
      filters: {
        ...block.filters,
        difficulties: [...(block.filters.difficulties || [])].sort(),
        statuses: [...(block.filters.statuses || [])].sort(),
      },
    })),
  };
}

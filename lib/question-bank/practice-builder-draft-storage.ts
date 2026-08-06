import type { PracticeOrderingMode } from './practice-allocation';
import type { PracticeFilters } from './practice-configuration';

export type PracticeBuilderDraft = {
  schemaVersion: 1;
  orderingMode: PracticeOrderingMode;
  filters: PracticeFilters;
  blocks: Array<{
    key: string;
    conceptId: string;
    courseIds: string[];
    requestedCount: number;
  }>;
};

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_PREFIX = 'dp-question-bank-practice-builder-draft:v1:';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'unrated']);
const STATUSES = new Set(['not_started', 'in_progress', 'completed']);
const SOURCE_SLUG = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const ORDERING_MODES = new Set<PracticeOrderingMode>([
  'mixed',
  'grouped',
  'interleaved',
  'easier_to_harder',
  'source_order',
]);

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function stringArray(value: unknown, allowed?: Set<string>) {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || (allowed && !allowed.has(item))) return null;
    if (!seen.has(item)) result.push(item);
    seen.add(item);
  }
  return result;
}

function nullableBoolean(value: unknown) {
  return value === null || typeof value === 'boolean';
}

export function parsePracticeBuilderDraft(value: unknown): PracticeBuilderDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  if (root.schemaVersion !== 1 || !ORDERING_MODES.has(root.orderingMode as PracticeOrderingMode))
    return null;
  if (!root.filters || typeof root.filters !== 'object' || Array.isArray(root.filters))
    return null;
  const filters = root.filters as Record<string, unknown>;
  const difficulties = stringArray(filters.difficulties, DIFFICULTIES);
  const statuses = stringArray(filters.statuses, STATUSES);
  const sourceSlugs =
    filters.sourceSlugs === undefined ? [] : stringArray(filters.sourceSlugs);
  if (
    !difficulties ||
    !statuses ||
    !sourceSlugs ||
    sourceSlugs.length > 20 ||
    sourceSlugs.some((sourceSlug) => !SOURCE_SLUG.test(sourceSlug)) ||
    !nullableBoolean(filters.saved) ||
    !nullableBoolean(filters.calculator) ||
    !Array.isArray(root.blocks) ||
    root.blocks.length > 1_000
  )
    return null;

  const seenKeys = new Set<string>();
  const blocks: PracticeBuilderDraft['blocks'] = [];
  for (const value of root.blocks) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const block = value as Record<string, unknown>;
    const courseIds = stringArray(block.courseIds);
    const requestedCount = Number(block.requestedCount);
    if (
      typeof block.key !== 'string' ||
      !KEY.test(block.key) ||
      seenKeys.has(block.key) ||
      typeof block.conceptId !== 'string' ||
      !UUID.test(block.conceptId) ||
      !courseIds ||
      courseIds.some((courseId) => !UUID.test(courseId)) ||
      !Number.isInteger(requestedCount) ||
      requestedCount < 0 ||
      requestedCount > 2_147_483_647
    )
      return null;
    seenKeys.add(block.key);
    blocks.push({
      key: block.key,
      conceptId: block.conceptId,
      courseIds,
      requestedCount,
    });
  }

  return {
    schemaVersion: 1,
    orderingMode: root.orderingMode as PracticeOrderingMode,
    filters: {
      difficulties: difficulties as PracticeFilters['difficulties'],
      statuses: statuses as PracticeFilters['statuses'],
      saved: filters.saved as boolean | null,
      calculator: filters.calculator as boolean | null,
      sourceSlugs,
    },
    blocks,
  };
}

export function readPracticeBuilderDraft(
  userId: string,
  storage: DraftStorage = window.localStorage,
) {
  const key = storageKey(userId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = parsePracticeBuilderDraft(JSON.parse(raw));
    if (!draft) storage.removeItem(key);
    return draft;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be disabled entirely; an unavailable draft is non-fatal.
    }
    return null;
  }
}

export function savePracticeBuilderDraft(
  userId: string,
  draft: PracticeBuilderDraft,
  storage: DraftStorage = window.localStorage,
) {
  storage.setItem(storageKey(userId), JSON.stringify(draft));
}

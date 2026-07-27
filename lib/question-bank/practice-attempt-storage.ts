export type StoredPracticeAttempt = {
  selectedChoiceIds: string[];
  answerChecked: boolean;
  showExplanation: boolean;
  updatedAt: number;
};

type StoredPracticeAttempts = Record<string, StoredPracticeAttempt>;

const STORAGE_KEY = 'dp_qb_practice_attempts_v1';

function normalizeSelectedChoices(value: unknown) {
  if (Array.isArray(value))
    return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
  if (typeof value === 'string' && value) return [value];
  return [];
}

function normalizeStoredAttempt(value: unknown): StoredPracticeAttempt | null {
  if (!value || typeof value !== 'object') return null;
  const attempt = value as Record<string, unknown>;
  if (
    typeof attempt.answerChecked !== 'boolean' ||
    typeof attempt.showExplanation !== 'boolean' ||
    typeof attempt.updatedAt !== 'number'
  )
    return null;

  // selectedChoice is the legacy single-answer field. Reading it keeps existing
  // local attempts valid while all new writes use selectedChoiceIds.
  const selectedChoiceIds = normalizeSelectedChoices(
    attempt.selectedChoiceIds ?? attempt.selectedChoice,
  );
  return {
    selectedChoiceIds,
    answerChecked: attempt.answerChecked,
    showExplanation: attempt.showExplanation,
    updatedAt: attempt.updatedAt,
  };
}

function readAll(): StoredPracticeAttempts {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([variantId, value]) => [variantId, normalizeStoredAttempt(value)] as const)
        .filter(
          (entry): entry is readonly [string, StoredPracticeAttempt] =>
            Boolean(entry[1]),
        ),
    );
  } catch {
    return {};
  }
}

function writeAll(attempts: StoredPracticeAttempts) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
  } catch {
    // Practice must continue even when storage is unavailable or full.
  }
}

export function readPracticeAttempt(variantId: string) {
  return readAll()[variantId] || null;
}

export function savePracticeAttempt(
  variantId: string,
  attempt: Omit<StoredPracticeAttempt, 'updatedAt'>,
) {
  const attempts = readAll();
  attempts[variantId] = { ...attempt, updatedAt: Date.now() };
  writeAll(attempts);
}

export function clearPracticeAttempt(variantId: string) {
  const attempts = readAll();
  if (!(variantId in attempts)) return;
  delete attempts[variantId];
  writeAll(attempts);
}

export function clearAllPracticeAttempts() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Reset remains best-effort when browser storage is blocked.
  }
}

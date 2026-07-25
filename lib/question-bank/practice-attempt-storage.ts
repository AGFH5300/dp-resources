export type StoredPracticeAttempt = {
  selectedChoice: string | null;
  answerChecked: boolean;
  showExplanation: boolean;
  updatedAt: number;
};

type StoredPracticeAttempts = Record<string, StoredPracticeAttempt>;

const STORAGE_KEY = 'dp_qb_practice_attempts_v1';

function isStoredAttempt(value: unknown): value is StoredPracticeAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Partial<StoredPracticeAttempt>;
  return (
    (attempt.selectedChoice === null || typeof attempt.selectedChoice === 'string') &&
    typeof attempt.answerChecked === 'boolean' &&
    typeof attempt.showExplanation === 'boolean' &&
    typeof attempt.updatedAt === 'number'
  );
}

function readAll(): StoredPracticeAttempts {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, StoredPracticeAttempt] =>
        isStoredAttempt(entry[1]),
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

export type StoredPracticeAttempt = {
  selectedChoiceIdsBySection: Record<string, string[]>;
  checkedSectionIds: string[];
  selectedChoiceIds: string[];
  /** @deprecated Compatibility mirror for legacy single-answer attempts. */
  selectedChoice: string | null;
  answerChecked: boolean;
  showExplanation: boolean;
  updatedAt: number;
};

type PracticeAttemptInput = {
  selectedChoiceIdsBySection?: Record<string, string[]>;
  checkedSectionIds?: string[];
  selectedChoiceIds?: string[];
  selectedChoice?: string | null;
  answerChecked?: boolean;
  showExplanation: boolean;
};

type StoredPracticeAttempts = Record<string, StoredPracticeAttempt>;

const STORAGE_KEY = 'dp_qb_practice_attempts_v1';

function normalizeSelectedChoices(value: unknown) {
  if (Array.isArray(value))
    return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
  if (typeof value === 'string' && value) return [value];
  return [];
}

function normalizeSectionChoices(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {} as Record<string, string[]>;
  return Object.fromEntries(
    Object.entries(value)
      .map(([sectionId, choices]) => [sectionId, normalizeSelectedChoices(choices)] as const)
      .filter(([, choices]) => choices.length > 0),
  );
}

function selectedChoiceMirror(selectedChoiceIds: string[]) {
  return selectedChoiceIds.length === 1 ? selectedChoiceIds[0] : null;
}

function firstSectionChoices(sections: Record<string, string[]>) {
  return Object.values(sections)[0] || [];
}

function normalizeStoredAttempt(value: unknown): StoredPracticeAttempt | null {
  if (!value || typeof value !== 'object') return null;
  const attempt = value as Record<string, unknown>;
  if (
    typeof attempt.showExplanation !== 'boolean' ||
    typeof attempt.updatedAt !== 'number'
  )
    return null;

  const selectedChoiceIdsBySection = normalizeSectionChoices(
    attempt.selectedChoiceIdsBySection,
  );
  const legacySelectedChoiceIds = normalizeSelectedChoices(
    attempt.selectedChoiceIds ?? attempt.selectedChoice,
  );
  const selectedChoiceIds =
    firstSectionChoices(selectedChoiceIdsBySection).length > 0
      ? firstSectionChoices(selectedChoiceIdsBySection)
      : legacySelectedChoiceIds;
  const checkedSectionIds = normalizeSelectedChoices(attempt.checkedSectionIds);
  const answerChecked =
    typeof attempt.answerChecked === 'boolean'
      ? attempt.answerChecked
      : checkedSectionIds.length > 0;

  return {
    selectedChoiceIdsBySection,
    checkedSectionIds,
    selectedChoiceIds,
    selectedChoice: selectedChoiceMirror(selectedChoiceIds),
    answerChecked,
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
  attempt: PracticeAttemptInput,
) {
  const selectedChoiceIdsBySection = normalizeSectionChoices(
    attempt.selectedChoiceIdsBySection,
  );
  const legacySelectedChoiceIds = normalizeSelectedChoices(
    attempt.selectedChoiceIds ?? attempt.selectedChoice,
  );
  const selectedChoiceIds =
    firstSectionChoices(selectedChoiceIdsBySection).length > 0
      ? firstSectionChoices(selectedChoiceIdsBySection)
      : legacySelectedChoiceIds;
  const checkedSectionIds = normalizeSelectedChoices(attempt.checkedSectionIds);
  const attempts = readAll();
  attempts[variantId] = {
    selectedChoiceIdsBySection,
    checkedSectionIds,
    selectedChoiceIds,
    selectedChoice: selectedChoiceMirror(selectedChoiceIds),
    answerChecked: attempt.answerChecked ?? checkedSectionIds.length > 0,
    showExplanation: attempt.showExplanation,
    updatedAt: Date.now(),
  };
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

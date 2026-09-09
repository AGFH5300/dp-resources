export type AcademicLevel = 'HL' | 'SL';
export type ExamSession = 'May' | 'November';

export type AcademicSubject = {
  slug: string;
  name: string;
  level: AcademicLevel;
};

export type AccountPreferences = {
  showLibrarySourceTags: boolean;
  showLibraryResourceTypeLabels: boolean;
  showQuestionBankSourceTags: boolean;
  showExpandedSourceAttribution: boolean;
  supportNotifications: boolean;
  showWhatsNew: boolean;
};

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  showLibrarySourceTags: true,
  showLibraryResourceTypeLabels: true,
  showQuestionBankSourceTags: true,
  showExpandedSourceAttribution: true,
  supportNotifications: true,
  showWhatsNew: true,
};

export function normalizeAccountPreferences(
  value: Partial<AccountPreferences> | null | undefined,
): AccountPreferences {
  const source = value || {};
  return {
    showLibrarySourceTags:
      source.showLibrarySourceTags !== false,
    showLibraryResourceTypeLabels:
      source.showLibraryResourceTypeLabels !== false,
    showQuestionBankSourceTags:
      source.showQuestionBankSourceTags !== false,
    showExpandedSourceAttribution:
      source.showExpandedSourceAttribution !== false,
    supportNotifications:
      source.supportNotifications !== false,
    showWhatsNew: source.showWhatsNew !== false,
  };
}

export function normalizeAcademicSubjects(value: unknown): AcademicSubject[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: AcademicSubject[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const level = row.level === 'HL' || row.level === 'SL' ? row.level : null;
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(slug)) continue;
    if (!name || name.length > 120 || !level) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ slug, name, level });
    if (result.length >= 8) break;
  }

  return result;
}

export function normalizeExamYear(value: unknown): number | null {
  if (value === null || value === '' || typeof value === 'undefined') return null;
  const year = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

export function normalizeExamSession(value: unknown): ExamSession | null {
  return value === 'May' || value === 'November' ? value : null;
}

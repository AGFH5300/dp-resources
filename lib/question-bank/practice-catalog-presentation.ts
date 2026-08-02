export type PracticeCatalogCourseRow = {
  id: string;
  slug: string;
  name: string;
  level: string | null;
  syllabusLabel: string | null;
  questionCount: number;
};

export type PracticeCatalogConceptRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  aliases: string[];
  mappingVersion: number;
  sourceConceptIds?: string[];
  courses: PracticeCatalogCourseRow[];
};

export type PracticeCatalogGroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  concepts: PracticeCatalogConceptRow[];
};

function normalizedWords(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bprobabilities\b/g, 'probability')
    .replace(/\bnumbers\b/g, 'number')
    .replace(/\boperations\b/g, 'operation')
    .replace(/\brelationships\b/g, 'relationship')
    .replace(/\bbehaviors\b/g, 'behaviour')
    .replace(/\bbehavior\b/g, 'behaviour')
    .replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function labelCandidates(value: string) {
  const candidates = [value];
  const withoutCourseScaffold = value
    .replace(/^\d{4}\s+(?:unit|section)\s+\d+\s+/i, '')
    .replace(/^\d{4}\s+(?:options?|core)\s+/i, '')
    .replace(/^\d{4}\s+optional themes\s+option\s+[a-z]\s+/i, '')
    .replace(/^\d{4}\s+option\s+[a-z]\s+/i, '');
  if (withoutCourseScaffold !== value) candidates.push(withoutCourseScaffold);

  const withoutYear = value.replace(/^\d{4}\s+/, '');
  if (withoutYear !== value) candidates.push(withoutYear);

  return [...new Set(candidates.map(normalizedWords).filter(Boolean))];
}

/**
 * Consolidate only labels that become equivalent after harmless presentation
 * cleanup (case/punctuation, singular/plural variants, and explicit syllabus
 * scaffolding such as "2024 Unit 4"). Different source-topic meanings remain
 * separate even when they share a word such as "Probability".
 */
export function consolidatePracticeCatalogGroups(
  groups: PracticeCatalogGroupRow[],
): PracticeCatalogGroupRow[] {
  const rows = groups.flatMap((group, groupIndex) =>
    group.concepts.map((concept, conceptIndex) => ({
      group,
      groupIndex,
      concept,
      conceptIndex,
      candidates: labelCandidates(concept.name),
    })),
  );
  const candidateFrequency = new Map<string, number>();
  for (const row of rows) {
    for (const candidate of row.candidates) {
      candidateFrequency.set(candidate, (candidateFrequency.get(candidate) || 0) + 1);
    }
  }

  const consolidated = new Map<
    string,
    {
      groupIndex: number;
      conceptIndex: number;
      concept: PracticeCatalogConceptRow;
      aliases: Set<string>;
      sourceConceptIds: Set<string>;
      courses: Map<string, PracticeCatalogCourseRow>;
    }
  >();

  for (const row of rows) {
    const key =
      row.candidates.find((candidate) => (candidateFrequency.get(candidate) || 0) > 1) ||
      row.candidates[0] ||
      row.concept.id;
    let target = consolidated.get(key);
    if (!target) {
      target = {
        groupIndex: row.groupIndex,
        conceptIndex: row.conceptIndex,
        concept: row.concept,
        aliases: new Set([row.concept.name, ...(row.concept.aliases || [])]),
        sourceConceptIds: new Set(
          row.concept.sourceConceptIds?.length
            ? row.concept.sourceConceptIds
            : [row.concept.id],
        ),
        courses: new Map(row.concept.courses.map((course) => [course.id, course])),
      };
      consolidated.set(key, target);
      continue;
    }

    target.aliases.add(row.concept.name);
    for (const alias of row.concept.aliases || []) target.aliases.add(alias);
    for (const conceptId of row.concept.sourceConceptIds?.length
      ? row.concept.sourceConceptIds
      : [row.concept.id])
      target.sourceConceptIds.add(conceptId);
    for (const course of row.concept.courses) {
      const existing = target.courses.get(course.id);
      target.courses.set(
        course.id,
        existing
          ? { ...existing, questionCount: Math.max(existing.questionCount, course.questionCount) }
          : course,
      );
    }
  }

  const conceptsByGroup = groups.map(() => [] as PracticeCatalogConceptRow[]);
  for (const target of consolidated.values()) {
    conceptsByGroup[target.groupIndex].push({
      ...target.concept,
      aliases: [...target.aliases],
      sourceConceptIds: [...target.sourceConceptIds].sort(),
      courses: [...target.courses.values()],
    });
  }

  return groups
    .map((group, index) => ({ ...group, concepts: conceptsByGroup[index] }))
    .filter((group) => group.concepts.length);
}


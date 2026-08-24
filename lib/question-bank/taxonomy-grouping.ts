export type TaxonomySubtopic = {
  id: string;
  slug?: string;
  name: string;
  canonical_name?: string | null;
  canonical_key?: string | null;
  sort_order?: number | null;
};

export type TaxonomyTopic = {
  id: string;
  slug?: string;
  name: string;
  canonical_name?: string | null;
  canonical_key?: string | null;
  sort_order?: number | null;
  subtopics?: TaxonomySubtopic[];
};

export type GroupedSubtopic = {
  id: string;
  ids: string[];
  name: string;
  canonicalKey: string;
  sortOrder: number;
  subtopics: TaxonomySubtopic[];
};

export type GroupedTopic = {
  id: string;
  ids: string[];
  name: string;
  canonicalKey: string;
  sortOrder: number;
  topics: TaxonomyTopic[];
  subtopics: GroupedSubtopic[];
};

const TAXONOMY_PREFIXES = [
  /^(?:topic|unit|chapter|theme|option)\s+(?:\d+(?:\.\d+)*|[a-z](?:\.\d+)*|[ivxlcdm]+)(?:\s*[:.)\]-]\s*|\s+)/i,
  /^(?:sl|hl|ahl)\s+\d+(?:\.\d+)*(?:[a-z])?(?:\s+\d+)?(?:\s*[:.)\]-]\s*|\s+)/i,
  /^(?:[a-z]\s*)\d+(?:\.\d+)+(?:[a-z])?(?:\s+\d+)?(?:\s*[:.)\]-]\s*|\s+)/i,
  /^\d+(?:\.\d+)+(?:[a-z])?(?:\s*[:.)\]-]\s*|\s+)/i,
  /^(?:\d+|[ivxlcdm]+)\s*[:.)\]-]\s*/i,
];

function canonicalLabel(value: unknown) {
  let label = String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

  // Different providers encode the same IB taxonomy with different syllabus
  // prefixes (for example B2.1, A1.3.2, SL 5.4, Topic 2, etc.). Strip only
  // code-shaped prefixes here; standalone theme letters are handled
  // contextually below so ordinary titles such as "A Theory of Knowledge" are
  // never damaged just because they begin with an article.
  for (let pass = 0; pass < 3; pass += 1) {
    const previous = label;
    for (const pattern of TAXONOMY_PREFIXES) {
      const next = label.replace(pattern, '').trim();
      if (next !== label) {
        label = next;
        break;
      }
    }
    if (label === previous) break;
  }

  return label
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackKey(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function rowName(row: {
  name: string;
  canonical_name?: string | null;
}) {
  return String(row.canonical_name || canonicalLabel(row.name)).trim();
}

function rowKey(row: {
  name: string;
  canonical_name?: string | null;
  canonical_key?: string | null;
}) {
  return String(row.canonical_key || fallbackKey(rowName(row))).trim();
}

function standaloneLetterAliasKey(row: {
  name: string;
  canonical_name?: string | null;
}) {
  const match = rowName(row).match(/^[a-z]\s+(.+)$/i);
  return match ? fallbackKey(match[1]) : null;
}

function sortOrder(row: { sort_order?: number | null }) {
  const value = Number(row.sort_order);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function compareRows<
  T extends {
    id: string;
    name: string;
    canonical_name?: string | null;
    sort_order?: number | null;
  },
>(left: T, right: T) {
  const leftCanonical = rowName(left);
  const rightCanonical = rowName(right);
  const leftUsesCanonicalLabel = left.name.trim() === leftCanonical;
  const rightUsesCanonicalLabel = right.name.trim() === rightCanonical;

  if (leftUsesCanonicalLabel !== rightUsesCanonicalLabel)
    return leftUsesCanonicalLabel ? -1 : 1;
  if (sortOrder(left) !== sortOrder(right))
    return sortOrder(left) - sortOrder(right);
  if (leftCanonical !== rightCanonical)
    return leftCanonical.localeCompare(rightCanonical);
  return left.id.localeCompare(right.id);
}

function groupedKey<
  T extends {
    id: string;
    name: string;
    canonical_name?: string | null;
    canonical_key?: string | null;
  },
>(row: T, availableKeys: Set<string>) {
  const key = rowKey(row) || row.id;
  const letterAlias = standaloneLetterAliasKey(row);

  // A/B/C/D/E-style theme letters are ambiguous in isolation. Only remove a
  // standalone leading letter when the same collection also contains the
  // unlettered label. This makes the rule provider-agnostic across subjects
  // without turning ordinary article-led names into false duplicates.
  return letterAlias && availableKeys.has(letterAlias) ? letterAlias : key;
}

function groupSubtopics(topics: TaxonomyTopic[]) {
  const subtopics = topics.flatMap((topic) => topic.subtopics || []);
  const availableKeys = new Set(subtopics.map((subtopic) => rowKey(subtopic)));
  const groups = new Map<string, TaxonomySubtopic[]>();

  for (const subtopic of subtopics) {
    const key = groupedKey(subtopic, availableKeys);
    const rows = groups.get(key);
    if (rows) rows.push(subtopic);
    else groups.set(key, [subtopic]);
  }

  return Array.from(groups.entries())
    .map(([canonicalKey, groupedSubtopics]): GroupedSubtopic => {
      const ordered = [...groupedSubtopics].sort(compareRows);
      const primary = ordered[0];
      return {
        id: primary.id,
        ids: ordered.map((subtopic) => subtopic.id),
        name: rowName(primary),
        canonicalKey,
        sortOrder: Math.min(...ordered.map(sortOrder)),
        subtopics: ordered,
      };
    })
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
}

export function groupCourseTopics(topics: TaxonomyTopic[]) {
  const availableKeys = new Set(topics.map((topic) => rowKey(topic)));
  const groups = new Map<string, TaxonomyTopic[]>();

  for (const topic of topics) {
    const key = groupedKey(topic, availableKeys);
    const rows = groups.get(key);
    if (rows) rows.push(topic);
    else groups.set(key, [topic]);
  }

  return Array.from(groups.entries())
    .map(([canonicalKey, topicRows]): GroupedTopic => {
      const ordered = [...topicRows].sort((left, right) => {
        const subtopicDifference =
          (right.subtopics?.length || 0) - (left.subtopics?.length || 0);
        return subtopicDifference || compareRows(left, right);
      });
      const primary = ordered[0];
      return {
        id: primary.id,
        ids: ordered.map((topic) => topic.id),
        name: rowName(primary),
        canonicalKey,
        sortOrder: Math.min(...ordered.map(sortOrder)),
        topics: ordered,
        subtopics: groupSubtopics(ordered),
      };
    })
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
}

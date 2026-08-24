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

function canonicalLabel(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /^(?:(?:[a-d]\s+(?=(?:unity and diversity|form and function|interaction and interdependence|continuity and change)(?:\s|$)))|(?:[a-e]\s+(?=(?:space,? time and motion|the particulate nature of matter|wave behavio(?:u)?r|fields|nuclear and quantum physics)(?:\s|$)))|(?:(?:topic|unit|chapter|theme|option)\s+)(?:\d+(?:\.\d+)*|[a-z](?:\.\d+)*|[ivxlcdm]+)(?:\s*[:.)\]-]\s*|\s+)|(?:\d+(?:\.\d+)+[a-z])\s+|(?:\d+(?:\.\d+)+|[a-z]\.\d+(?:\.\d+)*)(?:\s*[:.)\]-]\s*|\s+)|(?:\d+|[a-z]|[ivxlcdm]+)\s*[:.)\]-]\s*)/i,
      '',
    )
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

function groupSubtopics(topics: TaxonomyTopic[]) {
  const groups = new Map<string, TaxonomySubtopic[]>();

  for (const topic of topics) {
    for (const subtopic of topic.subtopics || []) {
      const key = rowKey(subtopic) || subtopic.id;
      const rows = groups.get(key);
      if (rows) rows.push(subtopic);
      else groups.set(key, [subtopic]);
    }
  }

  return Array.from(groups.entries())
    .map(([canonicalKey, subtopics]): GroupedSubtopic => {
      const ordered = [...subtopics].sort(compareRows);
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
  const groups = new Map<string, TaxonomyTopic[]>();

  for (const topic of topics) {
    const key = rowKey(topic) || topic.id;
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

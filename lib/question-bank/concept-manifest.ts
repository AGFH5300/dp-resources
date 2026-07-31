export type ConceptGroupManifest = {
  subjectSlug: string;
  slug: string;
  name: string;
};

export type ConceptMappingManifest = {
  courseSlug: string;
  topicKey: string;
  subtopicKey: string;
};

export type ConceptManifestEntry = {
  subjectSlug: string;
  groupSlug: string;
  slug: string;
  name: string;
  aliases: string[];
  mappings: ConceptMappingManifest[];
};

export type ConceptManifest = {
  version: number;
  description: string;
  groups: ConceptGroupManifest[];
  concepts: ConceptManifestEntry[];
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function nonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function slug(value: unknown, label: string) {
  const normalized = nonEmptyString(value, label);
  if (!SLUG.test(normalized))
    throw new Error(`${label} must use lowercase kebab-case.`);
  return normalized;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function list(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

export function parseConceptManifest(value: unknown): ConceptManifest {
  const root = object(value, 'Concept manifest');
  const version = Number(root.version);
  if (!Number.isInteger(version) || version < 1)
    throw new Error('Concept manifest version must be a positive integer.');

  const groups: ConceptGroupManifest[] = list(root.groups, 'groups').map(
    (raw, index) => {
      const row = object(raw, `groups[${index}]`);
      return {
        subjectSlug: slug(row.subjectSlug, `groups[${index}].subjectSlug`),
        slug: slug(row.slug, `groups[${index}].slug`),
        name: nonEmptyString(row.name, `groups[${index}].name`),
      };
    },
  );

  const groupKeys = new Set<string>();
  for (const group of groups) {
    const key = `${group.subjectSlug}:${group.slug}`;
    if (groupKeys.has(key)) throw new Error(`Duplicate concept group: ${key}`);
    groupKeys.add(key);
  }

  const concepts: ConceptManifestEntry[] = list(
    root.concepts,
    'concepts',
  ).map((raw, conceptIndex) => {
    const row = object(raw, `concepts[${conceptIndex}]`);
    const subjectSlug = slug(
      row.subjectSlug,
      `concepts[${conceptIndex}].subjectSlug`,
    );
    const groupSlug = slug(
      row.groupSlug,
      `concepts[${conceptIndex}].groupSlug`,
    );
    if (!groupKeys.has(`${subjectSlug}:${groupSlug}`))
      throw new Error(
        `Concept ${subjectSlug}:${String(row.slug || '')} references an unknown group.`,
      );

    const aliases = list(
      row.aliases ?? [],
      `concepts[${conceptIndex}].aliases`,
    ).map((alias, aliasIndex) =>
      nonEmptyString(alias, `concepts[${conceptIndex}].aliases[${aliasIndex}]`),
    );

    const mappings: ConceptMappingManifest[] = list(
      row.mappings,
      `concepts[${conceptIndex}].mappings`,
    ).map((rawMapping, mappingIndex) => {
      const mapping = object(
        rawMapping,
        `concepts[${conceptIndex}].mappings[${mappingIndex}]`,
      );
      return {
        courseSlug: slug(
          mapping.courseSlug,
          `concepts[${conceptIndex}].mappings[${mappingIndex}].courseSlug`,
        ),
        topicKey: nonEmptyString(
          mapping.topicKey,
          `concepts[${conceptIndex}].mappings[${mappingIndex}].topicKey`,
        ),
        subtopicKey: nonEmptyString(
          mapping.subtopicKey,
          `concepts[${conceptIndex}].mappings[${mappingIndex}].subtopicKey`,
        ),
      };
    });

    if (!mappings.length)
      throw new Error(`Concept ${subjectSlug}:${String(row.slug || '')} has no mappings.`);

    const mappingKeys = new Set<string>();
    for (const mapping of mappings) {
      const key = `${mapping.courseSlug}:${mapping.topicKey}:${mapping.subtopicKey}`;
      if (mappingKeys.has(key))
        throw new Error(
          `Concept ${subjectSlug}:${String(row.slug || '')} has duplicate mapping ${key}.`,
        );
      mappingKeys.add(key);
    }

    return {
      subjectSlug,
      groupSlug,
      slug: slug(row.slug, `concepts[${conceptIndex}].slug`),
      name: nonEmptyString(row.name, `concepts[${conceptIndex}].name`),
      aliases,
      mappings,
    };
  });

  const conceptKeys = new Set<string>();
  for (const concept of concepts) {
    const key = `${concept.subjectSlug}:${concept.slug}`;
    if (conceptKeys.has(key)) throw new Error(`Duplicate concept: ${key}`);
    conceptKeys.add(key);
  }

  return {
    version,
    description: nonEmptyString(root.description, 'description'),
    groups,
    concepts,
  };
}

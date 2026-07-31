import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseConceptManifest } from '@/lib/question-bank/concept-manifest';

const rawManifest = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'data/question-bank/practice-builder/pilot-concepts-v1.json',
    ),
    'utf8',
  ),
);

describe('Question Bank reviewed concept manifest', () => {
  it('parses the permanent cross-subject pilot catalogue', () => {
    const manifest = parseConceptManifest(rawManifest);

    expect(manifest.version).toBe(1);
    expect(manifest.groups).toHaveLength(3);
    expect(manifest.concepts.map((concept) => concept.slug)).toEqual([
      'kinematics',
      'forces-and-momentum',
      'integration',
      'stoichiometry',
    ]);
    expect(new Set(manifest.concepts.map((concept) => concept.subjectSlug))).toEqual(
      new Set(['physics', 'mathematics', 'chemistry']),
    );
    expect(
      manifest.concepts.reduce(
        (total, concept) => total + concept.mappings.length,
        0,
      ),
    ).toBe(25);
  });

  it('keeps mappings explicit to course, parent topic and subtopic', () => {
    const manifest = parseConceptManifest(rawManifest);

    for (const concept of manifest.concepts) {
      for (const mapping of concept.mappings) {
        expect(mapping.courseSlug).toBeTruthy();
        expect(mapping.topicKey).toBeTruthy();
        expect(mapping.subtopicKey).toBeTruthy();
      }
    }

    const forces = manifest.concepts.find(
      (concept) => concept.slug === 'forces-and-momentum',
    );
    expect(
      forces?.mappings.some(
        (mapping) => mapping.topicKey === 'e nuclear and quantum physics',
      ),
    ).toBe(false);
  });

  it('rejects concepts that reference missing groups', () => {
    const invalid = structuredClone(rawManifest);
    invalid.concepts[0].groupSlug = 'missing-group';
    expect(() => parseConceptManifest(invalid)).toThrow('unknown group');
  });

  it('rejects duplicate selectors and concepts without mappings', () => {
    const duplicate = structuredClone(rawManifest);
    duplicate.concepts[0].mappings.push(
      structuredClone(duplicate.concepts[0].mappings[0]),
    );
    expect(() => parseConceptManifest(duplicate)).toThrow('duplicate mapping');

    const empty = structuredClone(rawManifest);
    empty.concepts[0].mappings = [];
    expect(() => parseConceptManifest(empty)).toThrow('has no mappings');
  });
});

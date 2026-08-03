import { describe, expect, it } from 'vitest';

import {
  consolidatePracticeCatalogGroups,
  type PracticeCatalogGroupRow,
} from '@/lib/question-bank/practice-catalog-presentation';

function concept(id: string, name: string, courseId: string) {
  return {
    id,
    slug: id,
    name,
    description: '',
    aliases: [],
    mappingVersion: 1,
    courses: [
      {
        id: courseId,
        slug: courseId,
        name: courseId,
        level: null,
        syllabusLabel: null,
        questionCount: 10,
      },
    ],
  };
}

describe('practice catalogue presentation', () => {
  it('combines equivalent labels within a heading without crossing headings', () => {
    const groups: PracticeCatalogGroupRow[] = [
      {
        id: 'calculus',
        slug: 'calculus',
        name: 'Calculus',
        description: '',
        concepts: [concept('pilot-integration', 'Integration', 'AA HL')],
      },
      {
        id: 'topics',
        slug: 'topics',
        name: 'Topics',
        description: '',
        concepts: [
          concept('source-integration', 'Integration', 'Legacy HL'),
          concept('statistics', 'Statistics and Probability', 'AA SL'),
          concept('statistics-plural', 'Statistics And Probabilities', 'Legacy SL'),
        ],
      },
    ];

    const result = consolidatePracticeCatalogGroups(groups);
    const concepts = result.flatMap((group) => group.concepts);
    expect(concepts).toHaveLength(3);
    expect(result[0].concepts[0].sourceConceptIds).toEqual([
      'pilot-integration',
    ]);
    expect(result[1].concepts.find((row) => row.name === 'Integration'))
      .toMatchObject({
        sourceConceptIds: ['source-integration'],
        courses: [expect.objectContaining({ id: 'Legacy HL' })],
      });
    expect(
      concepts.find((row) => row.name === 'Statistics and Probability')
        ?.sourceConceptIds,
    ).toEqual(['statistics', 'statistics-plural']);
  });

  it('combines explicit syllabus scaffolding but keeps different combined topics separate', () => {
    const groups: PracticeCatalogGroupRow[] = [
      {
        id: 'topics',
        slug: 'topics',
        name: 'Topics',
        description: '',
        concepts: [
          concept('marketing', 'Marketing', 'Current'),
          concept('marketing-2023', '2023 Unit 4 Marketing', 'Legacy'),
          concept('marketing-2023-copy', '2023 Unit 4 Marketing', 'Legacy Copy'),
          concept('probability', 'Probability', 'AA'),
          concept(
            'logic-probability',
            'Logic, Sets And Probability',
            'Legacy Maths',
          ),
        ],
      },
    ];

    const concepts = consolidatePracticeCatalogGroups(groups)[0].concepts;
    expect(concepts).toHaveLength(3);
    expect(concepts.find((row) => row.name === 'Marketing')?.sourceConceptIds).toEqual([
      'marketing',
      'marketing-2023',
      'marketing-2023-copy',
    ]);
    expect(concepts.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Probability', 'Logic, Sets And Probability']),
    );
  });

  it('preserves redirects from every equivalent legacy catalogue entry', () => {
    const row = {
      ...concept('current', 'Calculus', 'AA'),
      legacyConceptIds: ['legacy-calculus'],
    };
    const duplicate = {
      ...concept('duplicate', 'Calculus', 'Legacy'),
      legacyConceptIds: ['legacy-integration'],
    };

    const [result] = consolidatePracticeCatalogGroups([
      {
        id: 'larger-topics',
        slug: 'larger-topics',
        name: 'Larger topics',
        description: '',
        concepts: [row, duplicate],
      },
    ]);

    expect(result.concepts[0].legacyConceptIds).toEqual([
      'legacy-calculus',
      'legacy-integration',
    ]);
  });
});

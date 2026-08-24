import { describe, expect, it } from 'vitest';

import { groupCourseTopics } from '@/lib/question-bank/taxonomy-grouping';

describe('question-bank taxonomy grouping', () => {
  it('combines raw numbered, option-prefixed, punctuation, and exact duplicate topics', () => {
    const groups = groupCourseTopics([
      {
        id: 'topic-cell-numbered',
        name: 'Topic 1: Cell Biology',
        sort_order: 1,
        subtopics: [
          {
            id: 'subtopic-water-numbered',
            name: '1.1 Water',
            sort_order: 1,
          },
        ],
      },
      {
        id: 'topic-cell-plain',
        name: 'Cell Biology',
        sort_order: 4,
        subtopics: [
          {
            id: 'subtopic-water-plain',
            name: 'Water',
            sort_order: 3,
          },
          {
            id: 'subtopic-origin',
            name: 'The Origin of Cells',
            sort_order: 4,
          },
        ],
      },
      {
        id: 'topic-option',
        name: 'Option C: Ecology & Conservation',
        sort_order: 8,
        subtopics: [],
      },
      {
        id: 'topic-option-plain',
        name: 'Ecology and Conservation',
        sort_order: 9,
        subtopics: [],
      },
      {
        id: 'topic-option-exact-copy',
        name: 'Ecology and Conservation',
        sort_order: 10,
        subtopics: [],
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      id: 'topic-cell-plain',
      name: 'Cell Biology',
      canonicalKey: 'cell biology',
      ids: expect.arrayContaining(['topic-cell-numbered', 'topic-cell-plain']),
    });
    expect(groups[0].subtopics).toHaveLength(2);
    expect(groups[0].subtopics[0]).toMatchObject({
      id: 'subtopic-water-plain',
      name: 'Water',
      canonicalKey: 'water',
      ids: expect.arrayContaining([
        'subtopic-water-numbered',
        'subtopic-water-plain',
      ]),
    });
    expect(groups[1]).toMatchObject({
      id: 'topic-option-plain',
      name: 'Ecology and Conservation',
      canonicalKey: 'ecology and conservation',
    });
    expect(groups[1].ids).toHaveLength(3);
  });

  it('deduplicates provider syllabus prefixes without subject-specific rules', () => {
    const groups = groupCourseTopics([
      {
        id: 'biology-membranes-coded',
        name: 'B2.1 Membranes and Membrane Transport',
        sort_order: 1,
      },
      {
        id: 'biology-membranes-plain',
        name: 'Membranes and Membrane Transport',
        sort_order: 2,
      },
      {
        id: 'biology-transport-coded',
        name: 'B3.2 Transport',
        sort_order: 3,
      },
      {
        id: 'biology-transport-plain',
        name: 'Transport',
        sort_order: 4,
      },
      {
        id: 'biology-water-coded',
        name: 'B3.2 7 Transport of Water From Roots to Leaves During Transpiration',
        sort_order: 5,
      },
      {
        id: 'math-integration-coded',
        name: 'SL 5.4 Integration',
        sort_order: 6,
      },
      {
        id: 'math-integration-plain',
        name: 'Integration',
        sort_order: 7,
      },
      {
        id: 'chemistry-stoichiometry-coded',
        name: 'A1.3.2 Stoichiometry',
        sort_order: 8,
      },
      {
        id: 'chemistry-stoichiometry-plain',
        name: 'Stoichiometry',
        sort_order: 9,
      },
    ]);

    expect(groups).toHaveLength(5);
    expect(groups[0]).toMatchObject({
      name: 'Membranes and Membrane Transport',
      canonicalKey: 'membranes and membrane transport',
      ids: expect.arrayContaining([
        'biology-membranes-coded',
        'biology-membranes-plain',
      ]),
    });
    expect(groups[1]).toMatchObject({
      name: 'Transport',
      canonicalKey: 'transport',
      ids: expect.arrayContaining([
        'biology-transport-coded',
        'biology-transport-plain',
      ]),
    });
    expect(groups[2]).toMatchObject({
      name: 'Transport of Water From Roots to Leaves During Transpiration',
      canonicalKey: 'transport of water from roots to leaves during transpiration',
    });
    expect(groups[3]).toMatchObject({
      name: 'Integration',
      canonicalKey: 'integration',
      ids: expect.arrayContaining([
        'math-integration-coded',
        'math-integration-plain',
      ]),
    });
    expect(groups[4]).toMatchObject({
      name: 'Stoichiometry',
      canonicalKey: 'stoichiometry',
      ids: expect.arrayContaining([
        'chemistry-stoichiometry-coded',
        'chemistry-stoichiometry-plain',
      ]),
    });
  });

  it('merges standalone theme letters only when an unlettered copy exists', () => {
    const groups = groupCourseTopics([
      { id: 'theme-a', name: 'A Unity and Diversity', sort_order: 1 },
      { id: 'theme-a-plain', name: 'Unity and Diversity', sort_order: 2 },
      { id: 'theme-d', name: 'D Fields', sort_order: 3 },
      { id: 'theme-d-plain', name: 'Fields', sort_order: 4 },
      { id: 'theme-c', name: 'C Global Interactions', sort_order: 5 },
      { id: 'theme-c-plain', name: 'Global Interactions', sort_order: 6 },
      { id: 'ordinary-article', name: 'A Theory of Knowledge', sort_order: 7 },
    ]);

    expect(groups).toHaveLength(4);
    expect(groups[0]).toMatchObject({
      name: 'Unity and Diversity',
      canonicalKey: 'unity and diversity',
      ids: expect.arrayContaining(['theme-a', 'theme-a-plain']),
    });
    expect(groups[1]).toMatchObject({
      name: 'Fields',
      canonicalKey: 'fields',
      ids: expect.arrayContaining(['theme-d', 'theme-d-plain']),
    });
    expect(groups[2]).toMatchObject({
      name: 'Global Interactions',
      canonicalKey: 'global interactions',
      ids: expect.arrayContaining(['theme-c', 'theme-c-plain']),
    });
    expect(groups[3]).toMatchObject({
      name: 'A Theory of Knowledge',
      canonicalKey: 'a theory of knowledge',
    });
  });

  it('does not interpret Unity, Units, or UNITED as Unit-prefixed taxonomy labels', () => {
    const groups = groupCourseTopics([
      {
        id: 'history-numbered',
        name: '3.UNITED States Civil War Causes Course and Effects 1840 77',
        sort_order: 1,
      },
      {
        id: 'history-plain',
        name: 'UNITED States Civil War Causes Course and Effects 1840 77',
        sort_order: 2,
      },
      { id: 'unity', name: 'Unity and Diversity', sort_order: 3 },
      {
        id: 'units',
        name: 'Units, Significant Figures, and Measurement',
        sort_order: 4,
      },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({
      id: 'history-plain',
      name: 'UNITED States Civil War Causes Course and Effects 1840 77',
      canonicalKey: 'united states civil war causes course and effects 1840 77',
      ids: expect.arrayContaining(['history-numbered', 'history-plain']),
    });
    expect(groups.map((group) => group.name)).toContain('Unity and Diversity');
    expect(groups.map((group) => group.name)).toContain(
      'Units, Significant Figures, and Measurement',
    );
  });

  it('strips numbered and alphanumeric syllabus codes from subtopics', () => {
    const groups = groupCourseTopics([
      {
        id: 'design-topic',
        name: 'Final Production',
        subtopics: [
          { id: 'composites-coded', name: '4.2F Composites', sort_order: 1 },
          { id: 'composites-plain', name: 'Composites', sort_order: 2 },
          {
            id: 'anthropometrics-coded',
            name: '1.1A Anthropometrics',
            sort_order: 3,
          },
          {
            id: 'anthropometrics-plain',
            name: 'Anthropometrics',
            sort_order: 4,
          },
          {
            id: 'twentieth-century',
            name: '11.20TH Century Nationalist and Independence Movements in Africa',
            sort_order: 5,
          },
        ],
      },
    ]);

    expect(groups[0].subtopics).toHaveLength(3);
    expect(groups[0].subtopics[0]).toMatchObject({
      name: 'Composites',
      canonicalKey: 'composites',
      ids: expect.arrayContaining(['composites-coded', 'composites-plain']),
    });
    expect(groups[0].subtopics[1]).toMatchObject({
      name: 'Anthropometrics',
      canonicalKey: 'anthropometrics',
      ids: expect.arrayContaining([
        'anthropometrics-coded',
        'anthropometrics-plain',
      ]),
    });
    expect(groups[0].subtopics[2]).toMatchObject({
      name: '20TH Century Nationalist and Independence Movements in Africa',
      canonicalKey:
        '20th century nationalist and independence movements in africa',
    });
  });

  it('keeps syllabus-year topic groups separate', () => {
    const groups = groupCourseTopics([
      {
        id: 'business-2023',
        name: '2023 Unit 1: Business Organization and Environment',
        sort_order: 1,
      },
      {
        id: 'business-2024',
        name: '2024 Unit 1: Introduction to Business Management',
        sort_order: 2,
      },
    ]);

    expect(groups.map((group) => group.canonicalKey)).toEqual([
      '2023 unit 1 business organization and environment',
      '2024 unit 1 introduction to business management',
    ]);
  });
});

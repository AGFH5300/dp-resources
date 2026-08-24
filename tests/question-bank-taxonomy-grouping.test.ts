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

  it('merges the four official Biology theme letters without stripping ordinary articles', () => {
    const groups = groupCourseTopics([
      { id: 'theme-a', name: 'A Unity and Diversity', sort_order: 1 },
      { id: 'theme-a-plain', name: 'Unity and Diversity', sort_order: 2 },
      { id: 'theme-b', name: 'B Form and Function', sort_order: 3 },
      { id: 'theme-b-plain', name: 'Form and Function', sort_order: 4 },
      { id: 'ordinary-article', name: 'A Theory of Knowledge', sort_order: 5 },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({
      name: 'Unity and Diversity',
      canonicalKey: 'unity and diversity',
      ids: expect.arrayContaining(['theme-a', 'theme-a-plain']),
    });
    expect(groups[1]).toMatchObject({
      name: 'Form and Function',
      canonicalKey: 'form and function',
      ids: expect.arrayContaining(['theme-b', 'theme-b-plain']),
    });
    expect(groups[2]).toMatchObject({
      name: 'A Theory of Knowledge',
      canonicalKey: 'a theory of knowledge',
    });
  });

  it('merges the official Physics theme letters with unprefixed copies', () => {
    const groups = groupCourseTopics([
      {
        id: 'physics-space-lettered',
        name: 'A Space Time and Motion',
        sort_order: 1,
      },
      {
        id: 'physics-space-plain',
        name: 'Space Time and Motion',
        sort_order: 2,
      },
      {
        id: 'physics-fields-lettered',
        name: 'D Fields',
        sort_order: 3,
      },
      {
        id: 'physics-fields-plain',
        name: 'Fields',
        sort_order: 4,
      },
      {
        id: 'ordinary-article',
        name: 'A Theory of Knowledge',
        sort_order: 5,
      },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({
      id: 'physics-space-plain',
      name: 'Space Time and Motion',
      canonicalKey: 'space time and motion',
      ids: expect.arrayContaining([
        'physics-space-lettered',
        'physics-space-plain',
      ]),
    });
    expect(groups[1]).toMatchObject({
      id: 'physics-fields-plain',
      name: 'Fields',
      canonicalKey: 'fields',
      ids: expect.arrayContaining([
        'physics-fields-lettered',
        'physics-fields-plain',
      ]),
    });
    expect(groups[2]).toMatchObject({
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

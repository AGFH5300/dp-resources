import { describe, expect, it } from 'vitest';

import { groupCourseTopics } from '@/lib/question-bank/taxonomy-grouping';

describe('question-bank taxonomy grouping', () => {
  it('combines numbered, option-prefixed, punctuation, and exact duplicate topics', () => {
    const groups = groupCourseTopics([
      {
        id: 'topic-cell-numbered',
        name: 'Topic 1: Cell Biology',
        canonical_name: 'Cell Biology',
        canonical_key: 'cell biology',
        sort_order: 1,
        subtopics: [
          {
            id: 'subtopic-water-numbered',
            name: '1.1 Water',
            canonical_name: 'Water',
            canonical_key: 'water',
            sort_order: 1,
          },
        ],
      },
      {
        id: 'topic-cell-plain',
        name: 'Cell Biology',
        canonical_name: 'Cell Biology',
        canonical_key: 'cell biology',
        sort_order: 4,
        subtopics: [
          {
            id: 'subtopic-water-plain',
            name: 'Water',
            canonical_name: 'Water',
            canonical_key: 'water',
            sort_order: 3,
          },
          {
            id: 'subtopic-origin',
            name: 'The Origin of Cells',
            canonical_name: 'The Origin of Cells',
            canonical_key: 'the origin of cells',
            sort_order: 4,
          },
        ],
      },
      {
        id: 'topic-option',
        name: 'Option C: Ecology & Conservation',
        canonical_name: 'Ecology and Conservation',
        canonical_key: 'ecology and conservation',
        sort_order: 8,
        subtopics: [],
      },
      {
        id: 'topic-option-plain',
        name: 'Ecology and Conservation',
        canonical_name: 'Ecology and Conservation',
        canonical_key: 'ecology and conservation',
        sort_order: 9,
        subtopics: [],
      },
      {
        id: 'topic-option-exact-copy',
        name: 'Ecology and Conservation',
        canonical_name: 'Ecology and Conservation',
        canonical_key: 'ecology and conservation',
        sort_order: 10,
        subtopics: [],
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      name: 'Cell Biology',
      canonicalKey: 'cell biology',
      ids: expect.arrayContaining(['topic-cell-numbered', 'topic-cell-plain']),
    });
    expect(groups[0].subtopics).toHaveLength(2);
    expect(groups[0].subtopics[0]).toMatchObject({
      name: 'Water',
      canonicalKey: 'water',
      ids: expect.arrayContaining([
        'subtopic-water-numbered',
        'subtopic-water-plain',
      ]),
    });
    expect(groups[1]).toMatchObject({
      name: 'Ecology and Conservation',
      canonicalKey: 'ecology and conservation',
    });
    expect(groups[1].ids).toHaveLength(3);
  });

  it('keeps syllabus-year topic groups separate', () => {
    const groups = groupCourseTopics([
      {
        id: 'business-2023',
        name: '2023 Unit 1: Business Organization and Environment',
        canonical_name: '2023 Unit 1: Business Organization and Environment',
        canonical_key: '2023 unit 1 business organization and environment',
        sort_order: 1,
      },
      {
        id: 'business-2024',
        name: '2024 Unit 1: Introduction to Business Management',
        canonical_name: '2024 Unit 1: Introduction to Business Management',
        canonical_key: '2024 unit 1 introduction to business management',
        sort_order: 2,
      },
    ]);

    expect(groups.map((group) => group.canonicalKey)).toEqual([
      '2023 unit 1 business organization and environment',
      '2024 unit 1 introduction to business management',
    ]);
  });
});

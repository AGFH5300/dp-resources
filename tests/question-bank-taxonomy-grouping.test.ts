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

  it('does not interpret ordinary words beginning with Unit as taxonomy prefixes', () => {
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
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: 'history-plain',
      name: 'UNITED States Civil War Causes Course and Effects 1840 77',
      canonicalKey: 'united states civil war causes course and effects 1840 77',
      ids: expect.arrayContaining(['history-numbered', 'history-plain']),
    });
    expect(groups[0].name).not.toMatch(/^D States/);
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

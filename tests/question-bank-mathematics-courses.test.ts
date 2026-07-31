import { describe, expect, it } from 'vitest';

import { splitMathematicsCourses } from '@/lib/question-bank/mathematics-courses';

const courses = [
  {
    id: 'aa-sl',
    slug: 'analysis-and-approaches-sl',
    name: 'Analysis and Approaches SL',
    level: 'SL',
    syllabus_label: 'Current syllabus',
  },
  {
    id: 'ai-sl',
    slug: 'applications-and-interpretation-sl',
    name: 'Applications and Interpretation SL',
    level: 'SL',
    syllabus_label: 'Current syllabus',
  },
  {
    id: 'aa-hl',
    slug: 'analysis-and-approaches-hl',
    name: 'Analysis and Approaches HL',
    level: 'HL',
    syllabus_label: 'Current syllabus',
  },
  {
    id: 'ai-hl',
    slug: 'applications-and-interpretation-hl',
    name: 'Applications and Interpretation HL',
    level: 'HL',
    syllabus_label: 'Current syllabus',
  },
  {
    id: 'studies-sl',
    slug: 'mathematical-studies-sl',
    name: 'Mathematical Studies SL',
    level: 'SL',
    syllabus_label: 'Legacy syllabus · final assessment 2019',
  },
  {
    id: 'math-sl',
    slug: 'mathematics-sl',
    name: 'Mathematics SL',
    level: 'SL',
    syllabus_label: 'Legacy syllabus · final assessment 2019',
  },
  {
    id: 'math-hl',
    slug: 'mathematics-hl',
    name: 'Mathematics HL',
    level: 'HL',
    syllabus_label: 'Legacy syllabus · final assessment 2019',
  },
  {
    id: 'further-sl',
    slug: 'further-mathematics-sl',
    name: 'Further Mathematics SL',
    level: 'SL',
    syllabus_label: 'Legacy syllabus · final assessment 2013',
  },
  {
    id: 'further-hl',
    slug: 'further-mathematics-hl',
    name: 'Further Mathematics HL',
    level: 'HL',
    syllabus_label: 'Legacy syllabus · final assessment 2019',
  },
];

describe('Mathematics course presentation', () => {
  it('keeps the four current courses visible and moves old courses into the archive', () => {
    const grouped = splitMathematicsCourses(courses);

    expect(grouped.current.map((course) => course.slug)).toEqual([
      'analysis-and-approaches-sl',
      'applications-and-interpretation-sl',
      'analysis-and-approaches-hl',
      'applications-and-interpretation-hl',
    ]);
    expect(grouped.standaloneLegacy.map((course) => course.slug)).toEqual([
      'mathematical-studies-sl',
      'mathematics-sl',
      'mathematics-hl',
    ]);
    expect(grouped.furtherMathematics.map((course) => course.slug)).toEqual([
      'further-mathematics-sl',
      'further-mathematics-hl',
    ]);
  });
});

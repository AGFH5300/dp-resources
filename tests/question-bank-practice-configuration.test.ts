import { describe, expect, it } from 'vitest';

import {
  parsePracticeConfiguration,
  stablePracticeConfiguration,
} from '@/lib/question-bank/practice-configuration';

const UUIDS = {
  concept: '11111111-1111-4111-8111-111111111111',
  physicsSl: '22222222-2222-4222-8222-222222222222',
  physicsLegacy: '33333333-3333-4333-8333-333333333333',
  mathsCourse: '44444444-4444-4444-8444-444444444444',
};

function configuration() {
  return {
    schemaVersion: 1,
    orderingMode: 'interleaved',
    filters: {
      difficulties: ['hard', 'easy', 'medium', 'unrated'],
      statuses: ['in_progress', 'not_started'],
      saved: null,
      calculator: null,
    },
    blocks: [
      {
        key: 'physics-kinematics',
        selectionType: 'concept',
        conceptId: UUIDS.concept,
        courseIds: [UUIDS.physicsSl, UUIDS.physicsLegacy],
        requestedCount: 12,
      },
      {
        key: 'maths-aa-hl',
        selectionType: 'course',
        courseId: UUIDS.mathsCourse,
        requestedCount: 8,
      },
    ],
  };
}

describe('Question Bank practice configuration', () => {
  it('supports concept blocks with independent courses and whole-course blocks', () => {
    const parsed = parsePracticeConfiguration(configuration());

    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0]).toMatchObject({
      selectionType: 'concept',
      conceptId: UUIDS.concept,
      courseIds: [UUIDS.physicsSl, UUIDS.physicsLegacy],
      requestedCount: 12,
    });
    expect(parsed.blocks[1]).toMatchObject({
      selectionType: 'course',
      courseId: UUIDS.mathsCourse,
      requestedCount: 8,
    });
  });

  it('normalizes filter ordering before hashing while preserving block priority', () => {
    const parsed = parsePracticeConfiguration(configuration());
    const stable = stablePracticeConfiguration(parsed);

    expect(stable.filters.difficulties).toEqual([
      'easy',
      'hard',
      'medium',
      'unrated',
    ]);
    expect(stable.filters.statuses).toEqual(['in_progress', 'not_started']);
    expect(stable.blocks.map((block) => block.key)).toEqual([
      'physics-kinematics',
      'maths-aa-hl',
    ]);
  });

  it('accepts configurations well beyond 200 questions', () => {
    const large = configuration();
    large.blocks[0].requestedCount = 1_250;
    large.blocks[1].requestedCount = 875;

    const parsed = parsePracticeConfiguration(large);
    expect(
      parsed.blocks.reduce((total, block) => total + block.requestedCount, 0),
    ).toBe(2_125);
  });

  it('rejects duplicate block keys and missing courses', () => {
    const duplicate = configuration();
    duplicate.blocks[1].key = duplicate.blocks[0].key;
    expect(() => parsePracticeConfiguration(duplicate)).toThrow(
      'Duplicate practice block key',
    );

    const noCourses = configuration();
    noCourses.blocks[0].courseIds = [];
    expect(() => parsePracticeConfiguration(noCourses)).toThrow(
      'courseIds cannot be empty',
    );
  });

  it('rejects malformed identifiers, invalid counts and unsupported filters', () => {
    const invalidId = configuration();
    invalidId.blocks[0].conceptId = 'not-a-uuid';
    expect(() => parsePracticeConfiguration(invalidId)).toThrow('valid UUID');

    const invalidCount = configuration();
    invalidCount.blocks[0].requestedCount = 0;
    expect(() => parsePracticeConfiguration(invalidCount)).toThrow(
      'positive whole number',
    );

    const invalidDifficulty = configuration();
    invalidDifficulty.filters.difficulties = ['impossible'];
    expect(() => parsePracticeConfiguration(invalidDifficulty)).toThrow(
      'invalid value',
    );
  });
});

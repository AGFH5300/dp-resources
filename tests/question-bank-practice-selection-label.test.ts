import { describe, expect, it } from 'vitest';

import {
  practiceSelectionLabel,
  singletonPracticeConceptIds,
} from '@/lib/question-bank/practice-selection-label';

describe('practice selection labels', () => {
  it('uses the larger-topic name when that topic has only one selectable child', () => {
    expect(
      practiceSelectionLabel('Animal Physiology', 'General questions', true),
    ).toBe('Animal Physiology');
  });

  it('keeps the child name when a larger topic has multiple selectable children', () => {
    expect(practiceSelectionLabel('Calculus', 'Integration', false)).toBe(
      'Integration',
    );
  });

  it('includes restored redirect concepts only when their visible topic has one child', () => {
    const ids = singletonPracticeConceptIds([
      {
        groups: [
          { name: 'Animal Physiology', concepts: [{ id: 'biology-child' }] },
          {
            name: 'Calculus',
            concepts: [{ id: 'differentiation' }, { id: 'integration' }],
          },
        ],
        redirectConcepts: [
          {
            groupName: 'Animal Physiology',
            concept: { id: 'biology-archived-parent' },
          },
          {
            groupName: 'Calculus',
            concept: { id: 'calculus-archived-parent' },
          },
        ],
      },
    ]);

    expect(ids).toEqual(
      new Set(['biology-child', 'biology-archived-parent']),
    );
  });
});

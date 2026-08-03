import { describe, expect, it } from 'vitest';

import { practiceSelectionLabel } from '@/lib/question-bank/practice-selection-label';

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
});

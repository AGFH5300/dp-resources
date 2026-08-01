import { describe, expect, it } from 'vitest';

import {
  readPracticeBuilderDraft,
  savePracticeBuilderDraft,
  type PracticeBuilderDraft,
} from '@/lib/question-bank/practice-builder-draft-storage';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const draft: PracticeBuilderDraft = {
  schemaVersion: 1,
  orderingMode: 'easier_to_harder',
  filters: {
    difficulties: ['hard'],
    statuses: ['not_started', 'in_progress'],
    saved: true,
    calculator: false,
  },
  blocks: [
    {
      key: 'block-1',
      conceptId: '11111111-1111-4111-8111-111111111111',
      courseIds: ['22222222-2222-4222-8222-222222222222'],
      requestedCount: 37,
    },
  ],
};

describe('Question Bank practice-builder drafts', () => {
  it('restores every editable setting under a user-scoped key', () => {
    const storage = memoryStorage();
    savePracticeBuilderDraft('user-a', draft, storage);

    expect(readPracticeBuilderDraft('user-a', storage)).toEqual(draft);
    expect(readPracticeBuilderDraft('user-b', storage)).toBeNull();
  });

  it('preserves temporarily incomplete topic state for back-navigation', () => {
    const storage = memoryStorage();
    const incomplete = {
      ...draft,
      blocks: [{ ...draft.blocks[0], courseIds: [], requestedCount: 0 }],
    };

    savePracticeBuilderDraft('user-a', incomplete, storage);
    expect(readPracticeBuilderDraft('user-a', storage)).toEqual(incomplete);
  });

  it('rejects and removes malformed stored data', () => {
    const storage = memoryStorage();
    storage.setItem(
      'dp-question-bank-practice-builder-draft:v1:user-a',
      JSON.stringify({ ...draft, orderingMode: 'invented' }),
    );

    expect(readPracticeBuilderDraft('user-a', storage)).toBeNull();
    expect(
      storage.getItem('dp-question-bank-practice-builder-draft:v1:user-a'),
    ).toBeNull();
  });
});

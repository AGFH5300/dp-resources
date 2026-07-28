import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllPracticeAttempts,
  readPracticeAttempt,
  savePracticeAttempt,
} from '@/lib/question-bank/practice-attempt-storage';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('grouped Question Bank browser attempts', () => {
  it('keeps selections and checked state isolated by choice section', () => {
    savePracticeAttempt('eb0143', {
      selectedChoiceIdsBySection: {
        'choice-section-1': ['B', 'D', 'E'],
        'choice-section-2': ['A'],
      },
      checkedSectionIds: ['choice-section-1'],
      showExplanation: false,
    });

    expect(readPracticeAttempt('eb0143')).toMatchObject({
      selectedChoiceIdsBySection: {
        'choice-section-1': ['B', 'D', 'E'],
        'choice-section-2': ['A'],
      },
      checkedSectionIds: ['choice-section-1'],
      hasGroupedState: true,
      selectedChoiceIds: ['B', 'D', 'E'],
      selectedChoice: null,
      answerChecked: false,
      showExplanation: false,
    });
  });

  it('never mirrors a later section into the first-section compatibility fields', () => {
    savePracticeAttempt('later-only', {
      selectedChoiceIdsBySection: {
        'choice-section-2': ['A'],
      },
      checkedSectionIds: ['choice-section-2'],
      showExplanation: false,
    });

    expect(readPracticeAttempt('later-only')).toMatchObject({
      selectedChoiceIdsBySection: {
        'choice-section-2': ['A'],
      },
      checkedSectionIds: ['choice-section-2'],
      hasGroupedState: true,
      selectedChoiceIds: [],
      selectedChoice: null,
      answerChecked: false,
    });
  });

  it('continues to read and mirror legacy single-section attempts', () => {
    savePracticeAttempt('legacy', {
      selectedChoice: 'C',
      answerChecked: true,
      showExplanation: true,
    });

    expect(readPracticeAttempt('legacy')).toMatchObject({
      selectedChoiceIdsBySection: {},
      checkedSectionIds: [],
      hasGroupedState: false,
      selectedChoiceIds: ['C'],
      selectedChoice: 'C',
      answerChecked: true,
      showExplanation: true,
    });
  });

  it('clears every grouped attempt', () => {
    savePracticeAttempt('a', {
      selectedChoiceIdsBySection: { 'choice-section-1': ['A'] },
      checkedSectionIds: ['choice-section-1'],
      showExplanation: true,
    });
    clearAllPracticeAttempts();
    expect(readPracticeAttempt('a')).toBeNull();
  });
});

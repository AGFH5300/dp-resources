import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllPracticeAttempts,
  clearPracticeAttempt,
  readPracticeAttempt,
  savePracticeAttempt,
} from '@/lib/question-bank/practice-attempt-storage';

const workspace = readFileSync(
  'components/question-bank/course-practice-workspace.tsx',
  'utf8',
);
const reportDialog = readFileSync('components/resource-actions.tsx', 'utf8');
const appSelect = readFileSync('components/ui/app-select.tsx', 'utf8');
const toaster = readFileSync('components/sonner-provider.tsx', 'utf8');

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

describe('browser-local Question Bank attempts', () => {
  it('saves, restores, resets one answer, and resets every answer', () => {
    savePracticeAttempt('variant-a', {
      selectedChoice: 'D',
      answerChecked: true,
      showExplanation: true,
    });
    savePracticeAttempt('variant-b', {
      selectedChoice: null,
      answerChecked: false,
      showExplanation: true,
    });

    expect(readPracticeAttempt('variant-a')).toMatchObject({
      selectedChoice: 'D',
      answerChecked: true,
      showExplanation: true,
    });
    expect(readPracticeAttempt('variant-b')).toMatchObject({
      selectedChoice: null,
      showExplanation: true,
    });

    clearPracticeAttempt('variant-a');
    expect(readPracticeAttempt('variant-a')).toBeNull();
    expect(readPracticeAttempt('variant-b')).not.toBeNull();

    clearAllPracticeAttempts();
    expect(readPracticeAttempt('variant-b')).toBeNull();
  });

  it('wires restoration and reset controls without storing answers in Supabase', () => {
    expect(workspace).toContain('readPracticeAttempt(payload.variant.id)');
    expect(workspace).toContain('savePracticeAttempt(detail.variant.id');
    expect(workspace).toContain('Reset this answer');
    expect(workspace).toContain('Reset all answers');
    expect(workspace).toContain('this browser only');
    expect(workspace).not.toContain('selectedChoice: state.selectedChoice');
  });
});

describe('question reporting', () => {
  it('keeps the original shared modal appearance and behaviour', () => {
    expect(reportDialog).toContain('className={className}');
    expect(reportDialog).toContain("resource.resourcePath || 'Library'");
    expect(reportDialog).toContain('bg-[color:var(--dp-navy)]');
    expect(reportDialog).not.toContain('dp-report-submit-button');
    expect(reportDialog).not.toContain("html[data-theme='dark'] .dp-report-button");
    expect(reportDialog).not.toContain("import { createPortal } from 'react-dom';");
    expect(reportDialog).not.toContain('createPortal(');
    expect(reportDialog).toContain('{open && (');
  });

  it('keeps dropdown options above the unchanged modal', () => {
    expect(reportDialog).toContain('z-[60]');
    expect(appSelect).toContain('z-[110]');
  });

  it('visually moves only the original lower report trigger into the toolbar', () => {
    expect(workspace).toContain('dp-qb-toolbar-report-button');
    expect(workspace).toContain('dp-qb-report-button');
    expect(reportDialog).toContain(
      '.dp-qb-practice-toolbar .dp-qb-toolbar-report-button',
    );
    expect(reportDialog).toContain('display: none !important');
    expect(reportDialog).toContain(
      '.dp-qb-reference-actions .dp-qb-report-button',
    );
    expect(reportDialog).toContain('position: absolute !important');
    expect(reportDialog).toContain("content: 'Report'");
  });
});

describe('toast close-button styling', () => {
  it('uses the tested compact size and a neutral border on every toast type', () => {
    expect(toaster).toContain('width: 1rem !important');
    expect(toaster).toContain('height: 1rem !important');
    expect(toaster).toContain('width: 0.75rem !important');
    expect(toaster).toContain('height: 0.75rem !important');
    expect(toaster).toContain(
      'border: 1px solid rgb(255 255 255 / 0.48) !important',
    );
    expect(toaster).toContain('background: rgb(255 255 255 / 0.08) !important');
  });
});

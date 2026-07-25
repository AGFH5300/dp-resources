import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const coursePage = readFileSync(
  'app/question-bank/[subjectSlug]/[courseSlug]/page.tsx',
  'utf8',
);
const courseLayout = readFileSync(
  'app/question-bank/[subjectSlug]/[courseSlug]/layout.tsx',
  'utf8',
);
const resetDialog = readFileSync(
  'components/question-bank/reset-all-answers-dialog.tsx',
  'utf8',
);
const stateRoute = readFileSync('app/api/question-bank/state/route.ts', 'utf8');
const adminLayout = readFileSync('app/admin/layout.tsx', 'utf8');
const unsuspendDialog = readFileSync(
  'components/admin/unsuspend-confirmation-dialog.tsx',
  'utf8',
);
const siteDialog = readFileSync('components/ui/site-confirm-dialog.tsx', 'utf8');


describe('Question Bank topic presentation', () => {
  it('removes syllabus letter prefixes and groups duplicate visible topic names', () => {
    expect(coursePage).toContain('function cleanTopicLabel');
    expect(coursePage).toContain("replace(/^[A-Z](?:[.)\\]:-])?\\s+(?=[A-Za-z])/");
    expect(coursePage).toContain('function groupTopicsForSidebar');
    expect(coursePage).toContain('sidebarTopicGroups.map');
    expect(coursePage).toContain('{group.displayName}');
  });
});

describe('Reset all answers confirmation', () => {
  it('uses an in-site choice modal and waits for an explicit confirmation', () => {
    expect(courseLayout).toContain('<ResetAllAnswersDialogBridge />');
    expect(resetDialog).toContain("type ResetScope = 'answers' | 'all_progress'");
    expect(resetDialog).toContain('Reset answers only');
    expect(resetDialog).toContain('Reset answers and progress');
    expect(resetDialog).toContain('Confirm reset');
    expect(resetDialog).toContain('aria-pressed={scope === \'answers\'}');
    expect(resetDialog).toContain('aria-pressed={scope === \'all_progress\'}');
    expect(resetDialog).toContain('onClick={() => void confirmReset()}');
    expect(resetDialog).toContain("scope: 'all_progress'");
    expect(resetDialog).toContain('<SiteConfirmDialog');
    expect(resetDialog).not.toContain(
      "toast.success('All Question Bank progress was reset to Not started.')",
    );
    expect(stateRoute).toContain('export async function DELETE');
    expect(stateRoute).toContain("body.scope !== 'all_progress'");
    expect(stateRoute).toContain(".from('dp_qb_user_progress')");
    expect(stateRoute).toContain(".eq('user_id', user.id)");
  });
});

describe('Admin unsuspend confirmation', () => {
  it('replaces the browser prompt with a DP Resources modal', () => {
    expect(adminLayout).toContain('<UnsuspendConfirmationDialogBridge />');
    expect(unsuspendDialog).toContain('Unsuspend this user?');
    expect(unsuspendDialog).toContain('<SiteConfirmDialog');
    expect(unsuspendDialog).toContain('window.confirm = interceptConfirm');
    expect(siteDialog).toContain('role="dialog"');
    expect(siteDialog).toContain('aria-modal="true"');
  });
});

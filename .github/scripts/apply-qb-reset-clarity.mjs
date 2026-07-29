import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

function replaceOnce(path, before, after) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(before)) {
    throw new Error(`Expected source block was not found in ${path}`);
  }
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  'lib/changelog.ts',
  `const historicalSummaries: Record<string, string[]> = {\n  '2026-07-28': [\n    'Added quick search inside the current Library folder and all of its subfolders.',\n    'Fixed the admin case inspector so replies, messages, and draft changes never carry over when switching between support tickets or resource reports.',\n    'Corrected support notification counts, added General inquiry, improved Content feedback in dark mode, and added a bulk mark-as-read action.',\n  ],`,
  `const historicalSummaries: Record<string, string[]> = {\n  '2026-07-29': [\n    'Made the Question Bank reset dialog clearly show the selected reset option before confirmation.',\n    'Restored instant single-answer checking, clarified correct and incorrect answer feedback, and made listening audio seekable.',\n    'Fixed supporting Question Bank images so verified markscheme, examiner-report, and content-reference diagrams render correctly.',\n  ],\n  '2026-07-28': [\n    'Added quick search inside the current Library folder and all of its subfolders.',\n    'Fixed the admin case inspector so replies, messages, and draft changes never carry over when switching between support tickets or resource reports.',\n    'Corrected support notification counts, added General inquiry, improved Content feedback in dark mode, and added a bulk mark-as-read action.',\n    'Added authenticated listening audio and exact-count, order-independent multiple-answer grading to the Question Bank.',\n    'Fixed listening-question audio placement, cleaned imported formatting, and kept later questions and answer choices in the correct order.',\n    'Improved multi-part listening questions so separate multiple-answer and single-answer sections stay interactive and independent.',\n    'Kept signed-in users signed in when visiting Privacy or Terms and added direct Library return actions.',\n  ],`,
);

replaceOnce(
  'tests/question-bank-topic-and-confirmation-modals.test.ts',
  `    expect(resetDialog).toContain('Reset answers and progress');\n    expect(resetDialog).toContain("scope: 'all_progress'");`,
  `    expect(resetDialog).toContain('Reset answers and progress');\n    expect(resetDialog).toContain('type="radio"');\n    expect(resetDialog).toContain('name="question-bank-reset-scope"');\n    expect(resetDialog).toContain('<legend className="sr-only">Choose what to reset</legend>');\n    expect(resetDialog).toContain('Selected');\n    expect(resetDialog).toContain("scope: 'all_progress'");`,
);

replaceOnce(
  'tests/changelog-page.test.ts',
  `    expect(summaries).toContain("'2026-07-22'");`,
  `    expect(summaries).toContain("'2026-07-29'");\n    expect(summaries).toContain(\n      'Made the Question Bank reset dialog clearly show the selected reset option before confirmation.',\n    );\n    expect(summaries).toContain(\n      'Restored instant single-answer checking, clarified correct and incorrect answer feedback, and made listening audio seekable.',\n    );\n    expect(summaries).toContain(\n      'Improved multi-part listening questions so separate multiple-answer and single-answer sections stay interactive and independent.',\n    );\n    expect(summaries).toContain("'2026-07-22'");`,
);

unlinkSync('.github/scripts/apply-qb-reset-clarity.mjs');
unlinkSync('.github/workflows/apply-qb-reset-clarity.yml');

execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
execFileSync('git', ['add', '-A']);
execFileSync('git', ['commit', '-m', 'Complete reset clarity and changelog coverage']);
execFileSync('git', ['push', 'origin', 'HEAD']);

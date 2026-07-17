import { readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const outputFile = 'vitest-results.json';
const vitestEntry = 'node_modules/vitest/vitest.mjs';

rmSync(outputFile, { force: true });

const run = spawnSync(
  process.execPath,
  [vitestEntry, 'run', '--reporter=json', `--outputFile=${outputFile}`],
  { stdio: 'inherit' },
);

try {
  const report = JSON.parse(readFileSync(outputFile, 'utf8'));
  const failedAssertions = [];

  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== 'failed') continue;

      failedAssertions.push({
        file: file.name,
        test: [...(assertion.ancestorTitles ?? []), assertion.title]
          .filter(Boolean)
          .join(' > '),
        message: String(assertion.failureMessages?.[0] ?? '')
          .split('\n')
          .slice(0, 8)
          .join('\n'),
      });
    }
  }

  console.log(
    `\nTest summary: ${report.numPassedTests ?? 0} passed, ${report.numFailedTests ?? 0} failed.`,
  );

  for (const failure of failedAssertions) {
    console.log(`\nFAIL ${failure.file}`);
    console.log(`  ${failure.test}`);
    if (failure.message) console.log(failure.message);
  }
} catch (error) {
  console.error('Unable to read the Vitest JSON report:', error);
} finally {
  if (!process.env.GITHUB_ACTIONS) {
    rmSync(outputFile, { force: true });
  }
}

process.exit(run.status ?? 1);

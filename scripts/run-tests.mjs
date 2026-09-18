import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const TEST_FILE_RE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;
const PER_FILE_TIMEOUT_MS = 60_000;

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? collectTests(path) : [path];
    })
    .filter((path) => TEST_FILE_RE.test(path))
    .sort();
}

const tests = collectTests(resolve('tests'));
const vitestBin = resolve('node_modules/vitest/vitest.mjs');

if (!tests.length) {
  console.error('No test files found.');
  process.exit(1);
}

console.log(`Running ${tests.length} test files in isolated Vitest processes.`);

for (let index = 0; index < tests.length; index += 1) {
  const testFile = tests[index];
  const relative = testFile.slice(process.cwd().length + 1);
  console.log(`\n[${index + 1}/${tests.length}] ${relative}`);

  const result = spawnSync(
    process.execPath,
    [vitestBin, 'run', relative, '--pool=threads', '--maxWorkers=1'],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      timeout: PER_FILE_TIMEOUT_MS,
      env: process.env,
    },
  );

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      console.error(`Timed out after ${PER_FILE_TIMEOUT_MS / 1000}s: ${relative}`);
    } else {
      console.error(`Unable to run ${relative}:`, result.error);
    }
    process.exit(1);
  }

  if (result.signal) {
    console.error(`Test process ended by signal ${result.signal}: ${relative}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Test file failed with exit code ${result.status}: ${relative}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nAll ${tests.length} test files passed.`);

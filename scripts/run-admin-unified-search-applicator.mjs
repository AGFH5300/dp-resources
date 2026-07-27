#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const result = spawnSync(process.execPath, ['scripts/apply-admin-unified-search.mjs'], {
  encoding: 'utf8',
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');

if (result.status !== 0) {
  await writeFile(
    'apply-admin-unified-search-error.txt',
    `${result.stdout || ''}${result.stderr || ''}`,
  );
}

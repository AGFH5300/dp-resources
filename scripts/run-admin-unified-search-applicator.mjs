#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const applicatorPath = 'scripts/apply-admin-unified-search.mjs';
let applicator = await readFile(applicatorPath, 'utf8');
const ambiguousBlock = `await replaceOnce(
  'app/admin/admin-console.tsx',
  \`      <EmailSearchInput label="User email" value={email} onChange={setEmail} />\`,
  \`      <Field label="Search users">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Full name, username, email, role, status…"
          className={inputClass}
        />
      </Field>\`,
  'replace user email search with unified search',
);`;
const preciseBlock = `await replaceOnce(
  'app/admin/admin-console.tsx',
  \`    <div className="mt-3 grid gap-3 md:grid-cols-4">
      <EmailSearchInput label="User email" value={email} onChange={setEmail} />\`,
  \`    <div className="mt-3 grid gap-3 md:grid-cols-4">
      <Field label="Search users">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Full name, username, email, role, status…"
          className={inputClass}
        />
      </Field>\`,
  'replace user email search with unified search',
);`;
if (!applicator.includes(ambiguousBlock)) {
  throw new Error('Could not locate the ambiguous Users search applicator block.');
}
applicator = applicator.replace(ambiguousBlock, preciseBlock);
await writeFile(applicatorPath, applicator);

const result = spawnSync(process.execPath, [applicatorPath], {
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

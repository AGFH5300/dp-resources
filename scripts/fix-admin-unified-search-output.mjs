#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const path = 'app/admin/page.tsx';
const source = await readFile(path, 'utf8');
const broken = '    const uniqueDomains = Array.from(    const uniqueDomains = Array.from(';
const count = source.split(broken).length - 1;
if (count !== 1) {
  throw new Error(`Expected one duplicated uniqueDomains boundary, found ${count}.`);
}
await writeFile(path, source.replace(broken, '    const uniqueDomains = Array.from('));

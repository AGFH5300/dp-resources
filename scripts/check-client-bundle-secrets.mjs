import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = '.next/static';
const forbiddenText = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_SECRET_ACCESS_KEY',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'NEXT_PUBLIC_SUPABASE',
  'sb_secret_',
  '-----BEGIN PRIVATE KEY-----',
];
const forbiddenPatterns = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
];

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    const details = await stat(path);
    if (details.isDirectory()) output.push(...await filesUnder(path));
    else output.push(path);
  }
  return output;
}

const failures = [];
for (const path of await filesUnder(root)) {
  const content = await readFile(path, 'utf8').catch(() => '');
  for (const needle of forbiddenText) {
    if (content.includes(needle)) failures.push(`${relative(root, path)} contains ${needle}`);
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) failures.push(`${relative(root, path)} matches ${pattern}`);
  }
}

if (failures.length) {
  console.error('Client bundle secret boundary failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Client bundle contains no API keys or server-secret markers.');

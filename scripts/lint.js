import { readFile } from 'node:fs/promises';

const files = ['src/server.js', 'public/app.js', 'scripts/build.js', 'scripts/lint.js', 'scripts/test.js'];
const banned = ['download' + '_completed', 'drive' + '.google.com'];
let failed = false;
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const pattern of banned) {
    if (text.includes(pattern)) {
      console.error(`${file} contains banned text: ${pattern}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log('Lint checks passed.');

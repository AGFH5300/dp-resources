import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('src/server.js', 'dist/server.js');
await cp('public', 'dist/public', { recursive: true });
console.log('Built DP Resources into dist/.');

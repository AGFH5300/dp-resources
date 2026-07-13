import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'node_modules', 'pdfjs-dist');
const targetRoot = path.join(root, 'public', 'pdfjs');
const assetDirectories = ['wasm', 'standard_fonts', 'cmaps', 'iccs'];

await mkdir(targetRoot, { recursive: true });

for (const directory of assetDirectories) {
  const source = path.join(sourceRoot, directory);
  const target = path.join(targetRoot, directory);
  await access(source);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

console.log('Copied PDF.js runtime assets to public/pdfjs.');

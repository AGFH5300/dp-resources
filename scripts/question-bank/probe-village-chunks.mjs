#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APP_URL = 'https://village.pirateib.su/';
const MAIN_URL = new URL('main.js', APP_URL).href;
const TIMEOUT_MS = 45_000;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sanitizeHead(source, limit = 2400) {
  return source
    .slice(0, limit)
    .replace(/(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g, (match) => `<str:${match.length - 2}>`)
    .replace(/\s+/g, ' ')
    .slice(0, limit);
}

function propertyKeys(source) {
  const keys = new Set();
  for (const match of source.matchAll(/["']([A-Za-z_][A-Za-z0-9_ -]{0,48})["']\s*:/g)) {
    keys.add(match[1]);
    if (keys.size >= 200) break;
  }
  return [...keys].sort();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'DP-Resources-Village-Chunk-Probe/1.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return { text, response };
  } finally {
    clearTimeout(timer);
  }
}

const output = path.resolve(process.argv[2] || path.join(process.cwd(), '.question-bank-reports', 'village-chunk-probe.json'));
const { text: main } = await fetchText(MAIN_URL);
const chunkIds = [...new Set([...main.matchAll(/\bu\.e\((\d+)\)/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);

const rows = [];
for (let index = 0; index < chunkIds.length; index += 1) {
  const chunkId = chunkIds[index];
  const url = new URL(`${chunkId}.questionData.js`, MAIN_URL).href;
  try {
    const { text, response } = await fetchText(url);
    const probe = {
      chunk_id: chunkId,
      url,
      status: response.status,
      content_type: response.headers.get('content-type'),
      bytes: Buffer.byteLength(text),
      sha256: sha256(text),
      markers: {
        webpack_chunk_push: /webpackChunk|\.push\s*\(\s*\[\s*\[/.test(text),
        json_parse: /JSON\.parse\s*\(/.test(text),
        module_exports: /module\.exports|\.exports\s*=/.test(text),
        default_export: /default/.test(text),
        base64_decode: /atob\s*\(|base64/i.test(text),
      },
      property_keys: propertyKeys(text),
      sanitized_head: index < 5 ? sanitizeHead(text) : null,
    };
    rows.push(probe);
  } catch (error) {
    rows.push({ chunk_id: chunkId, url, error: error.message });
  }
}

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  format: 'dp-village-question-chunk-probe-v1',
  main_url: MAIN_URL,
  chunk_count: chunkIds.length,
  chunk_ids: chunkIds,
  chunks: rows,
}, null, 2)}\n`);
console.log(`Probed ${rows.filter((row) => !row.error).length}/${chunkIds.length} Village question-data chunks.`);
console.log(`Output: ${output}`);

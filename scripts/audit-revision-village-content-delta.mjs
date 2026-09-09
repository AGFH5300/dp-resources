#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  sourceQuestionId,
  strictQuestionSignature,
} from './question-bank/revision-village-delta.mjs';

function usage() {
  return `Revision Village same-ID content audit

Usage:
  node scripts/audit-revision-village-content-delta.mjs \\
    --baseline <july-zip-or-directory> \\
    --current <current-zip-or-directory> \\
    --output <json> [--expected-common 2366]

Accepted inputs:
- finalized ZIPs containing question-bank/unique-questions.ndjson;
- directories containing question-bank/unique-questions.ndjson;
- processed directories containing unique-questions.ndjson.

This command is read-only and performs no production writes.
`;
}

function parseArgs(argv) {
  const options = {
    baseline: null,
    current: null,
    output: null,
    expectedCommon: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') return { help: true };
    if (token === '--baseline') options.baseline = argv[++index];
    else if (token === '--current') options.current = argv[++index];
    else if (token === '--output') options.output = argv[++index];
    else if (token === '--expected-common') options.expectedCommon = Number(argv[++index]);
    else throw new Error(`Unknown option: ${token}`);
  }
  if (!options.baseline || !options.current || !options.output) {
    throw new Error('--baseline, --current and --output are required.');
  }
  if (
    options.expectedCommon != null &&
    (!Number.isInteger(options.expectedCommon) || options.expectedCommon < 0)
  ) {
    throw new Error('--expected-common must be a non-negative integer.');
  }
  options.baseline = path.resolve(options.baseline);
  options.current = path.resolve(options.current);
  options.output = path.resolve(options.output);
  return options;
}

function parseNdjson(source, label) {
  return String(source || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid NDJSON in ${label}:${index + 1}: ${error.message}`);
      }
    });
}

async function readZipEntry(zipFile) {
  for (const entry of [
    'question-bank/unique-questions.ndjson',
    'unique-questions.ndjson',
  ]) {
    const result = spawnSync('unzip', ['-p', zipFile, `*/${entry}`], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (result.status === 0 && result.stdout.trim()) {
      return parseNdjson(result.stdout, `${zipFile}:${entry}`);
    }
    const direct = spawnSync('unzip', ['-p', zipFile, entry], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (direct.status === 0 && direct.stdout.trim()) {
      return parseNdjson(direct.stdout, `${zipFile}:${entry}`);
    }
  }
  throw new Error(`No unique-questions.ndjson was found in ${zipFile}.`);
}

async function readQuestions(input) {
  const info = await stat(input);
  if (info.isFile()) {
    if (!input.toLowerCase().endsWith('.zip')) {
      throw new Error(`Only ZIP files are accepted as file inputs: ${input}`);
    }
    return readZipEntry(input);
  }
  if (!info.isDirectory()) throw new Error(`Unsupported input: ${input}`);

  for (const candidate of [
    path.join(input, 'question-bank', 'unique-questions.ndjson'),
    path.join(input, 'unique-questions.ndjson'),
  ]) {
    try {
      const source = await readFile(candidate, 'utf8');
      return parseNdjson(source, candidate);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`No unique-questions.ndjson was found under ${input}.`);
}

function indexQuestions(rows, label) {
  const result = new Map();
  for (const row of rows) {
    const id = sourceQuestionId(row);
    if (!id) continue;
    const next = {
      id,
      reference: String(row?.reference || '').trim(),
      signature: strictQuestionSignature(row),
    };
    const existing = result.get(id);
    if (existing && existing.signature !== next.signature) {
      throw new Error(`${label} contains conflicting records for source UUID ${id}.`);
    }
    result.set(id, next);
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const baseline = indexQuestions(await readQuestions(options.baseline), 'Baseline');
  const current = indexQuestions(await readQuestions(options.current), 'Current');
  const baselineIds = new Set(baseline.keys());
  const currentIds = new Set(current.keys());
  const commonIds = [...baselineIds].filter((id) => currentIds.has(id)).sort();
  const newIds = [...currentIds].filter((id) => !baselineIds.has(id)).sort();
  const removedIds = [...baselineIds].filter((id) => !currentIds.has(id)).sort();
  const changed = [];
  const unchanged = [];

  for (const id of commonIds) {
    const before = baseline.get(id);
    const after = current.get(id);
    if (before.signature === after.signature) {
      unchanged.push(id);
    } else {
      changed.push({
        id,
        baselineReference: before.reference,
        currentReference: after.reference,
        baselineSignature: before.signature,
        currentSignature: after.signature,
      });
    }
  }

  if (
    options.expectedCommon != null &&
    commonIds.length !== options.expectedCommon
  ) {
    throw new Error(
      `Expected ${options.expectedCommon} common question IDs; found ${commonIds.length}. ` +
        'Refusing to present a partial same-ID audit as complete.',
    );
  }

  const report = {
    provider: 'revision_village',
    generatedAt: new Date().toISOString(),
    baseline: options.baseline,
    current: options.current,
    counts: {
      baseline: baseline.size,
      current: current.size,
      common: commonIds.length,
      unchangedSameId: unchanged.length,
      changedSameId: changed.length,
      newIds: newIds.length,
      removedIds: removedIds.length,
    },
    changedSameId: changed,
    newIds,
    removedIds,
    productionWritesPerformed: false,
  };
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\nREVISION VILLAGE SAME-ID CONTENT AUDIT');
  console.log('----------------------------------------');
  console.log(`Baseline IDs       : ${baseline.size}`);
  console.log(`Current IDs        : ${current.size}`);
  console.log(`Common IDs         : ${commonIds.length}`);
  console.log(`UNCHANGED same ID  : ${unchanged.length}`);
  console.log(`CHANGED same ID    : ${changed.length}`);
  console.log(`NEW IDs            : ${newIds.length}`);
  console.log(`REMOVED IDs        : ${removedIds.length}`);
  console.log(`Report             : ${options.output}`);
  console.log('Production writes  : NONE');
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.stack || error.message}`);
  process.exitCode = 1;
});

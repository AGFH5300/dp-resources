#!/usr/bin/env node

import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  EXAM_MATE_OPTIMIZATION_CHECKSUMS_SHA256,
  EXAM_MATE_OPTIMIZATION_EXPECTED,
  EXAM_MATE_OPTIMIZATION_PLAN_SHA256,
  EXAM_MATE_OPTIMIZATION_ROWS_SHA256,
  correctedExamMateSelectedContentType,
  loadExamMateOptimizationAudit,
  resolveExamMateOptimizationAudit,
} from './question-bank/exam-mate-optimization.mjs';

function parseArguments(argv) {
  const options = {
    optimizationAudit: null,
    assetsRoot: null,
    report: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--optimization-audit')
      options.optimizationAudit = argv[++index];
    else if (token === '--assets-root') options.assetsRoot = argv[++index];
    else if (token === '--report') options.report = argv[++index];
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.optimizationAudit)
    throw new Error('--optimization-audit is required.');
  if (!options.assetsRoot) throw new Error('--assets-root is required.');
  return options;
}

function withinRoot(root, filePath) {
  return filePath === root || filePath.startsWith(`${root}${path.sep}`);
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export function selectedFileSignature(buffer, format) {
  if (format === 'png') {
    return buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (format === 'webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (format === 'bmp') {
    return buffer.subarray(0, 2).toString('ascii') === 'BM';
  }
  return false;
}

async function listRegularFiles(root) {
  const output = [];
  async function visit(directory) {
    const handle = await opendir(directory);
    for await (const entry of handle) {
      const filePath = path.join(directory, entry.name);
      const info = await lstat(filePath);
      if (info.isSymbolicLink()) {
        throw new Error(`Symbolic link is not allowed in staging: ${filePath}`);
      }
      if (info.isDirectory()) await visit(filePath);
      else if (info.isFile()) output.push(filePath);
      else throw new Error(`Unsupported staging entry type: ${filePath}`);
    }
  }
  await visit(root);
  return output;
}

async function verifySelectedFile(assetsRoot, row) {
  const target = path.resolve(assetsRoot, ...String(row.selectedPath).split('/'));
  if (!withinRoot(assetsRoot, target)) {
    throw new Error(`Selected path escapes the asset root: ${row.selectedPath}`);
  }
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Selected path is not a regular file: ${row.selectedPath}`);
  }
  const canonical = await realpath(target);
  if (!withinRoot(assetsRoot, canonical)) {
    throw new Error(`Selected path resolves outside the asset root: ${row.selectedPath}`);
  }
  if (info.size !== Number(row.selectedBytes)) {
    throw new Error(`Selected byte count mismatch: ${row.selectedPath}`);
  }
  const extension = path.extname(target).toLowerCase();
  const expectedExtension = `.${row.selectedFormat}`;
  if (extension !== expectedExtension) {
    throw new Error(`Selected extension mismatch: ${row.selectedPath}`);
  }
  const auditedContentType =
    row.selectedFormat === 'webp' ? 'image/webp' : 'image/png';
  if (row.selectedContentType !== auditedContentType) {
    throw new Error(`Selected MIME type mismatch: ${row.selectedPath}`);
  }
  const correctedContentType = correctedExamMateSelectedContentType(row);
  const signatureFormat =
    correctedContentType === 'image/bmp' ? 'bmp' : row.selectedFormat;
  const handle = await open(target, 'r');
  const header = Buffer.alloc(12);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  if (!selectedFileSignature(header, signatureFormat)) {
    throw new Error(`Selected file signature mismatch: ${row.selectedPath}`);
  }
  const digest = await hashFile(target);
  if (digest !== row.selectedHash) {
    throw new Error(`Selected SHA-256 mismatch: ${row.selectedPath}`);
  }
  return {
    format: row.selectedFormat,
    bytes: info.size,
    path: row.selectedPath,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const assetsRoot = path.resolve(options.assetsRoot);
  const optimizationArchive = await resolveExamMateOptimizationAudit(
    options.optimizationAudit,
  );
  try {
    const audit = await loadExamMateOptimizationAudit(optimizationArchive.root);
    const selectedPathSet = new Set(
      audit.planRows.map((row) => path.resolve(
        assetsRoot,
        ...String(row.selectedPath).split('/'),
      )),
    );
    if (selectedPathSet.size !== audit.planRows.length) {
      throw new Error('Optimization plan contains duplicate selected paths.');
    }

    const assetDirectories = [
      path.join(assetsRoot, 'optimized-assets', 'sha256'),
      path.join(assetsRoot, 'assets', 'sha256'),
    ];
    const stagedFiles = (
      await Promise.all(assetDirectories.map(listRegularFiles))
    ).flat().map((filePath) => path.resolve(filePath));
    const stagedFileSet = new Set(stagedFiles);
    const unexpected = stagedFiles.filter(
      (filePath) => !selectedPathSet.has(filePath),
    );
    const missing = [...selectedPathSet].filter(
      (filePath) => !stagedFileSet.has(filePath),
    );
    if (unexpected.length || missing.length) {
      throw new Error(
        `Staging file-set mismatch: ${missing.length} missing, ${unexpected.length} unexpected.`,
      );
    }

    const counts = { webp: 0, png: 0, files: 0, bytes: 0 };
    for (const [index, row] of audit.planRows.entries()) {
      const verified = await verifySelectedFile(assetsRoot, row);
      counts[verified.format] += 1;
      counts.files += 1;
      counts.bytes += verified.bytes;
      if ((index + 1) % 1000 === 0 || index + 1 === audit.planRows.length) {
        process.stdout.write(
          `Verified staged selected assets ${index + 1}/${audit.planRows.length}\n`,
        );
      }
    }

    if (
      counts.files !== EXAM_MATE_OPTIMIZATION_EXPECTED.totalAssets ||
      counts.webp !== EXAM_MATE_OPTIMIZATION_EXPECTED.optimizedWebp ||
      counts.png !== EXAM_MATE_OPTIMIZATION_EXPECTED.retainedPng ||
      counts.bytes !== EXAM_MATE_OPTIMIZATION_EXPECTED.selectedBytes
    ) {
      throw new Error(`Complete staged optimization count mismatch: ${JSON.stringify(counts)}`);
    }

    const report = {
      verificationStatus: 'passed',
      optimizationAuditSha256: audit.auditSha256,
      optimizationChecksumsSha256: audit.checksumsSha256,
      optimizationChecksumsPinSha256:
        EXAM_MATE_OPTIMIZATION_CHECKSUMS_SHA256,
      optimizationPlanSha256: EXAM_MATE_OPTIMIZATION_PLAN_SHA256,
      optimizationRowsSha256: EXAM_MATE_OPTIMIZATION_ROWS_SHA256,
      counts,
      unexpectedFiles: 0,
      missingFiles: 0,
      symbolicLinks: 0,
      pathTraversalEntries: 0,
    };
    if (options.report) {
      const reportPath = path.resolve(options.report);
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await optimizationArchive.cleanup();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}

import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { deterministicUuid } from './archive.mjs';

export const EXAM_MATE_OPTIMIZATION_VERSION = 'exam-mate-optimization-1.0.2';
export const EXAM_MATE_OPTIMIZATION_AUDIT_SHA256 =
  'e9f5ef0767d2404caabf6d8b328e7b16361cc308841fd964fa99b513b2f3a4b8';
export const EXAM_MATE_OPTIMIZATION_CHECKSUMS_SHA256 =
  '3a7729dcf1cc7db10a1e57bcaa9df4fb7ffaa2e4e940e025efeee2b0d6f73883';
export const EXAM_MATE_OPTIMIZATION_PLAN_SHA256 =
  '4d43d7eeff8bfba65463d72d0d300482d52c0c5cf9df1e3dc7db10ec933f8b74';
export const EXAM_MATE_OPTIMIZATION_ROWS_SHA256 =
  'a04411148771050bde7e47f70de0fe2727b31db589a61265eddf57e0303ef67e';
export const EXAM_MATE_RETAINED_BMP_CORRECTION = Object.freeze({
  hash: '78f599c7ed82ee88047aec5471df1e727c3802b81f630c63978e0c95e9511c2b',
  path:
    'assets/sha256/78/78f599c7ed82ee88047aec5471df1e727c3802b81f630c63978e0c95e9511c2b.png',
  bytes: 601_454,
  auditedContentType: 'image/png',
  auditedFormat: 'png',
  contentType: 'image/bmp',
  verificationMode: 'optimizer-error-original-retained-by-exact-sha256',
});
export const EXAM_MATE_OPTIMIZATION_EXPECTED = Object.freeze({
  totalAssets: 31_336,
  optimizedWebp: 31_328,
  retainedPng: 8,
  retainedAfterOptimizerError: 2,
  failures: 0,
  originalBytes: 2_212_998_664,
  selectedBytes: 863_895_760,
  savedBytes: 1_349_102_904,
  sourceQuestions: 14_199,
  sourceAssetManifestRows: 32_198,
  sourceUniquePhysicalAssets: 31_336,
  sourceChecksumsSha256:
    'ac4699532e92f6dd40ae79a89bc03b4b2556d2ab3030c766ba84bed70224d361',
  sourceAssetManifestSha256:
    'd37b50b37676cfc28028706a69d9e249782d11124126ca3d5b906501d92474e0',
});

export function correctedExamMateSelectedContentType(row) {
  if (row.selectedHash !== EXAM_MATE_RETAINED_BMP_CORRECTION.hash) {
    return row.selectedContentType;
  }
  const correction = EXAM_MATE_RETAINED_BMP_CORRECTION;
  if (
    row.selectedPath !== correction.path ||
    Number(row.selectedBytes) !== correction.bytes ||
    row.selectedContentType !== correction.auditedContentType ||
    row.selectedFormat !== correction.auditedFormat ||
    row.pixelVerification?.mode !== correction.verificationMode
  ) {
    throw new Error(
      'Pinned retained-BMP correction no longer matches the reviewed optimization row.',
    );
  }
  return correction.contentType;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function hashFileWithBytes(filePath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }
  return { sha256: hash.digest('hex'), bytes };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function* readNdjson(filePath) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch (error) {
      throw new Error(
        `Invalid NDJSON at ${path.basename(filePath)}:${lineNumber}: ${error.message}`,
      );
    }
  }
}

async function readAllNdjson(filePath) {
  const rows = [];
  for await (const row of readNdjson(filePath)) rows.push(row);
  return rows;
}

export async function resolveExamMateOptimizationAudit(inputPath) {
  const resolved = path.resolve(inputPath);
  const inputStat = await stat(resolved);
  if (inputStat.isDirectory()) {
    return {
      root: resolved,
      sourcePath: resolved,
      sourceSha256: null,
      cleanup: async () => {},
    };
  }
  if (!resolved.toLowerCase().endsWith('.zip')) {
    throw new Error('Exam-Mate optimization input must be the reviewed ZIP or extracted directory.');
  }
  const digest = await hashFile(resolved);
  if (digest !== EXAM_MATE_OPTIMIZATION_AUDIT_SHA256) {
    throw new Error(
      `Exam-Mate optimization audit ZIP SHA-256 mismatch: expected ${EXAM_MATE_OPTIMIZATION_AUDIT_SHA256}, received ${digest}.`,
    );
  }
  const destination = await mkdtemp(path.join(tmpdir(), 'dp-exam-mate-optimization-'));
  const result = spawnSync('unzip', ['-q', resolved, '-d', destination], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Unable to extract Exam-Mate optimization audit: ${result.stderr}`);
  }
  return {
    root: destination,
    sourcePath: resolved,
    sourceSha256: digest,
    cleanup: () => rm(destination, { recursive: true, force: true }),
  };
}

function parseChecksumRows(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/i);
      if (!match) throw new Error(`Invalid optimization checksum line: ${line}`);
      return { sha256: match[1].toLowerCase(), relative: match[2] };
    });
}

function exactCount(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
  }
}

function assertOptimizationSummary(summary, progress, failuresText) {
  if (summary.format !== 'dp-resources-exam-mate-local-optimization-summary-v1') {
    throw new Error(`Unsupported optimization summary format: ${summary.format}`);
  }
  if (summary.optimizerVersion !== '1.0.2') {
    throw new Error(`Unsupported optimizer version: ${summary.optimizerVersion}`);
  }
  if (progress.status !== 'completed' || progress.stopped !== false) {
    throw new Error('Optimization progress is not complete.');
  }
  if (failuresText.trim()) {
    throw new Error('Optimization audit contains failure rows.');
  }

  exactCount('optimization total assets', summary.assets?.total, EXAM_MATE_OPTIMIZATION_EXPECTED.totalAssets);
  exactCount('optimized WebP assets', summary.assets?.optimized, EXAM_MATE_OPTIMIZATION_EXPECTED.optimizedWebp);
  exactCount('retained PNG assets', summary.assets?.retainedOriginal, EXAM_MATE_OPTIMIZATION_EXPECTED.retainedPng);
  exactCount(
    'retained-after-optimizer-error assets',
    summary.assets?.retainedAfterOptimizerError,
    EXAM_MATE_OPTIMIZATION_EXPECTED.retainedAfterOptimizerError,
  );
  exactCount('optimization failures', summary.assets?.failures, EXAM_MATE_OPTIMIZATION_EXPECTED.failures);
  exactCount('original bytes', summary.bytes?.original, EXAM_MATE_OPTIMIZATION_EXPECTED.originalBytes);
  exactCount('selected bytes', summary.bytes?.selected, EXAM_MATE_OPTIMIZATION_EXPECTED.selectedBytes);
  exactCount('saved bytes', summary.bytes?.saved, EXAM_MATE_OPTIMIZATION_EXPECTED.savedBytes);
  exactCount(
    'source questions',
    summary.sourceVerification?.sourceQuestions,
    EXAM_MATE_OPTIMIZATION_EXPECTED.sourceQuestions,
  );
  exactCount(
    'source asset-manifest rows',
    summary.sourceVerification?.assetManifestRows,
    EXAM_MATE_OPTIMIZATION_EXPECTED.sourceAssetManifestRows,
  );
  exactCount(
    'source unique physical assets',
    summary.sourceVerification?.uniquePhysicalAssets,
    EXAM_MATE_OPTIMIZATION_EXPECTED.sourceUniquePhysicalAssets,
  );
  if (
    summary.sourceVerification?.checksumsSha256 !==
    EXAM_MATE_OPTIMIZATION_EXPECTED.sourceChecksumsSha256
  ) {
    throw new Error('Optimization audit is not tied to the reviewed Exam-Mate source checksums.');
  }
  if (
    summary.sourceVerification?.assetManifestSha256 !==
    EXAM_MATE_OPTIMIZATION_EXPECTED.sourceAssetManifestSha256
  ) {
    throw new Error('Optimization audit is not tied to the reviewed Exam-Mate asset manifest.');
  }
  if (
    summary.guarantees?.sourceHashesVerified !== true ||
    summary.guarantees?.selectedHashesVerified !== true ||
    summary.guarantees?.lossyEncodingUsed !== false ||
    summary.guarantees?.originalsModified !== false ||
    summary.guarantees?.originalsDeleted !== false
  ) {
    throw new Error('Optimization audit guarantees are incomplete or unsafe.');
  }
}

export async function loadExamMateOptimizationAudit(root) {
  const required = [
    'source-verification.json',
    'optimization-summary.json',
    'optimization-progress.json',
    'optimization-failures.ndjson',
    'optimization-checksums.sha256',
    'index/asset-optimizations.ndjson',
    'index/asset-upload-plan.ndjson',
  ];
  for (const relative of required) {
    if (!(await exists(path.join(root, ...relative.split('/'))))) {
      throw new Error(`Exam-Mate optimization audit is missing ${relative}.`);
    }
  }

  const checksumPath = path.join(root, 'optimization-checksums.sha256');
  const checksumDigest = await hashFile(checksumPath);
  if (checksumDigest !== EXAM_MATE_OPTIMIZATION_CHECKSUMS_SHA256) {
    throw new Error(
      `Optimization checksums SHA-256 mismatch: expected ${EXAM_MATE_OPTIMIZATION_CHECKSUMS_SHA256}, received ${checksumDigest}.`,
    );
  }

  const [sourceVerification, summary, progress, failuresText, checksumText] =
    await Promise.all([
      readFile(path.join(root, 'source-verification.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'optimization-summary.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'optimization-progress.json'), 'utf8').then(JSON.parse),
      readFile(path.join(root, 'optimization-failures.ndjson'), 'utf8'),
      readFile(checksumPath, 'utf8'),
    ]);

  assertOptimizationSummary(summary, progress, failuresText);
  if (sourceVerification.status !== 'passed') {
    throw new Error('Optimization source verification did not pass.');
  }

  const checksumRows = parseChecksumRows(checksumText);
  const checksumByPath = new Map(checksumRows.map((row) => [row.relative, row.sha256]));
  for (const relative of required.filter((value) => value !== 'optimization-checksums.sha256')) {
    const expected = checksumByPath.get(relative);
    if (!expected) throw new Error(`Optimization checksum entry is missing for ${relative}.`);
    const actual = await hashFile(path.join(root, ...relative.split('/')));
    if (actual !== expected) throw new Error(`Optimization metadata checksum mismatch for ${relative}.`);
  }

  const planPath = path.join(root, 'index', 'asset-upload-plan.ndjson');
  const rowsPath = path.join(root, 'index', 'asset-optimizations.ndjson');
  const [planDigest, rowsDigest, planRows, optimizationRows] = await Promise.all([
    hashFile(planPath),
    hashFile(rowsPath),
    readAllNdjson(planPath),
    readAllNdjson(rowsPath),
  ]);
  if (planDigest !== EXAM_MATE_OPTIMIZATION_PLAN_SHA256) {
    throw new Error('Pinned optimization upload plan checksum mismatch.');
  }
  if (rowsDigest !== EXAM_MATE_OPTIMIZATION_ROWS_SHA256) {
    throw new Error('Pinned optimization rows checksum mismatch.');
  }
  exactCount('optimization plan rows', planRows.length, EXAM_MATE_OPTIMIZATION_EXPECTED.totalAssets);
  exactCount('optimization record rows', optimizationRows.length, EXAM_MATE_OPTIMIZATION_EXPECTED.totalAssets);

  const optimizationByOriginalHash = new Map();
  for (const row of optimizationRows) {
    if (!/^[0-9a-f]{64}$/.test(String(row.originalHash || ''))) {
      throw new Error('Optimization record contains an invalid original hash.');
    }
    if (optimizationByOriginalHash.has(row.originalHash)) {
      throw new Error(`Duplicate optimization record for ${row.originalHash}.`);
    }
    optimizationByOriginalHash.set(row.originalHash, row);
  }

  const planByOriginalHash = new Map();
  const selectedHashes = new Set();
  const selectedPaths = new Set();
  let webp = 0;
  let png = 0;
  let fallbackCount = 0;
  let originalBytes = 0;
  let selectedBytes = 0;
  for (const row of planRows) {
    const originalHash = String(row.originalSourceHash || '');
    if (!/^[0-9a-f]{64}$/.test(originalHash)) {
      throw new Error('Optimization upload plan contains an invalid original hash.');
    }
    if (planByOriginalHash.has(originalHash)) {
      throw new Error(`Duplicate optimization upload plan row for ${originalHash}.`);
    }
    if (!/^[0-9a-f]{64}$/.test(String(row.selectedHash || ''))) {
      throw new Error(`Optimization upload plan has an invalid selected hash for ${originalHash}.`);
    }
    if (selectedHashes.has(row.selectedHash) || selectedPaths.has(row.selectedPath)) {
      throw new Error(`Optimization upload plan reuses a selected hash or path for ${originalHash}.`);
    }
    if (row.pixelVerification?.passed !== true) {
      throw new Error(`Optimization verification did not pass for ${originalHash}.`);
    }
    const optimization = optimizationByOriginalHash.get(originalHash);
    if (!optimization) {
      throw new Error(`Optimization record missing for ${originalHash}.`);
    }
    for (const key of ['selectedHash', 'selectedPath', 'selectedBytes', 'selectedContentType', 'selectedFormat']) {
      if (row[key] !== optimization[key]) {
        throw new Error(`Optimization plan/record mismatch for ${originalHash} (${key}).`);
      }
    }
    if (row.selectedFormat === 'webp') webp += 1;
    else if (row.selectedFormat === 'png') png += 1;
    else throw new Error(`Unsupported selected format ${row.selectedFormat}.`);
    if (
      optimization.pixelVerificationMode ===
      'optimizer-error-original-retained-by-exact-sha256'
    ) {
      fallbackCount += 1;
    }
    originalBytes += Number(row.originalSourceBytes || 0);
    selectedBytes += Number(row.selectedBytes || 0);
    selectedHashes.add(row.selectedHash);
    selectedPaths.add(row.selectedPath);
    planByOriginalHash.set(originalHash, { ...row, optimization });
  }

  exactCount('selected WebP rows', webp, EXAM_MATE_OPTIMIZATION_EXPECTED.optimizedWebp);
  exactCount('selected PNG rows', png, EXAM_MATE_OPTIMIZATION_EXPECTED.retainedPng);
  exactCount(
    'optimizer-error fallback rows',
    fallbackCount,
    EXAM_MATE_OPTIMIZATION_EXPECTED.retainedAfterOptimizerError,
  );
  exactCount('plan original bytes', originalBytes, EXAM_MATE_OPTIMIZATION_EXPECTED.originalBytes);
  exactCount('plan selected bytes', selectedBytes, EXAM_MATE_OPTIMIZATION_EXPECTED.selectedBytes);

  return {
    version: EXAM_MATE_OPTIMIZATION_VERSION,
    auditSha256: EXAM_MATE_OPTIMIZATION_AUDIT_SHA256,
    checksumsSha256: checksumDigest,
    summary,
    progress,
    sourceVerification,
    checksumRows,
    checksumByPath,
    planRows,
    planByOriginalHash,
    optimizationRows,
    optimizationByOriginalHash,
  };
}

function optimizationFinding(severity, code, details) {
  return {
    id: deterministicUuid(`exam-mate-optimization-finding:${severity}:${code}:${JSON.stringify(details)}`),
    severity,
    code,
    source_dataset: 'Exam-Mate optimization',
    source_question_id: null,
    source_reference: null,
    details,
  };
}

export function selectedManifestRow(originalRow, planRow) {
  return {
    ...originalRow,
    originalSha256: originalRow.sha256,
    originalPath: originalRow.path,
    originalBytes: Number(originalRow.bytes || 0),
    sha256: planRow.selectedHash,
    path: planRow.selectedPath,
    bytes: Number(planRow.selectedBytes),
    contentType: correctedExamMateSelectedContentType(planRow),
    selectedFormat: planRow.selectedFormat,
    optimized: Boolean(planRow.optimized),
    savingsBytes: Number(planRow.savingsBytes || 0),
    savingsPercent: Number(planRow.savingsPercent || 0),
    optimizationAuditSha256: EXAM_MATE_OPTIMIZATION_AUDIT_SHA256,
    pixelVerification: planRow.pixelVerification,
  };
}

export async function applyExamMateOptimizationPlan(normalized, optimizationAudit, options = {}) {
  if (normalized.verificationStatus !== 'passed') {
    throw new Error('Optimization plan cannot be applied because source verification failed.');
  }
  const findings = [...normalized.findings];
  const mappedByUrl = new Map();
  for (const [url, originalRow] of normalized.source.verifiedAssetByUrl) {
    const plan = optimizationAudit.planByOriginalHash.get(String(originalRow.sha256 || ''));
    if (!plan) {
      findings.push(
        optimizationFinding('critical', 'exam_mate_optimization_plan_missing_asset', {
          url,
          originalHash: originalRow.sha256,
        }),
      );
      continue;
    }
    mappedByUrl.set(url, selectedManifestRow(originalRow, plan));
  }

  const usedSelectedRows = [...normalized.source.usedAssetUrls]
    .map((url) => mappedByUrl.get(url))
    .filter(Boolean);
  const usedSelectedByHash = new Map(usedSelectedRows.map((row) => [row.sha256, row]));
  if (usedSelectedByHash.size !== normalized.source.usedPhysicalHashes.size) {
    findings.push(
      optimizationFinding('critical', 'exam_mate_optimization_used_asset_count_mismatch', {
        original: normalized.source.usedPhysicalHashes.size,
        selected: usedSelectedByHash.size,
      }),
    );
  }

  let locallyVerifiedSelectedAssets = 0;
  const assetRoot = options.assetRoot || normalized.source.assetRoot;
  if (options.requireLocalAssets || options.verifyLocalAssets) {
    for (const row of usedSelectedByHash.values()) {
      const filePath = path.join(assetRoot, ...String(row.path).split('/'));
      if (!(await exists(filePath))) {
        findings.push(
          optimizationFinding('critical', 'exam_mate_selected_asset_missing', {
            selectedHash: row.sha256,
            selectedPath: row.path,
          }),
        );
        continue;
      }
      if (options.verifyLocalAssets) {
        const digest = await hashFileWithBytes(filePath);
        if (digest.sha256 !== row.sha256 || digest.bytes !== Number(row.bytes)) {
          findings.push(
            optimizationFinding('critical', 'exam_mate_selected_asset_verification_failed', {
              selectedHash: row.sha256,
              selectedPath: row.path,
              expectedBytes: row.bytes,
              actualHash: digest.sha256,
              actualBytes: digest.bytes,
            }),
          );
          continue;
        }
      }
      locallyVerifiedSelectedAssets += 1;
    }
  }

  const usedFallbacks = [...normalized.source.usedPhysicalHashes]
    .map((hash) => optimizationAudit.planByOriginalHash.get(String(hash)))
    .filter(
      (row) =>
        row?.optimization?.pixelVerificationMode ===
        'optimizer-error-original-retained-by-exact-sha256',
    );
  for (const row of usedFallbacks) {
    findings.push(
      optimizationFinding('info', 'exam_mate_verified_original_retained', {
        originalHash: row.originalSourceHash,
        selectedPath: row.selectedPath,
        reason: row.optimization?.optimizationFallback?.message || 'optimizer error',
      }),
    );
  }

  const combinedArchiveSha256 = sha256(
    `${normalized.archiveSha256}\n${EXAM_MATE_OPTIMIZATION_AUDIT_SHA256}`,
  );
  const actualCounts = {
    ...normalized.actualCounts,
    optimizationPlanAssets: optimizationAudit.planRows.length,
    optimizationSelectedWebp: optimizationAudit.summary.assets.optimized,
    optimizationRetainedPng: optimizationAudit.summary.assets.retainedOriginal,
    optimizationRetainedAfterError:
      optimizationAudit.summary.assets.retainedAfterOptimizerError,
    optimizationOriginalBytes: optimizationAudit.summary.bytes.original,
    optimizationSelectedBytes: optimizationAudit.summary.bytes.selected,
    optimizationSavedBytes: optimizationAudit.summary.bytes.saved,
    optimizedImportPhysicalAssets: usedSelectedByHash.size,
    locallyVerifiedSelectedAssets,
  };
  const expectedCounts = {
    ...normalized.expectedCounts,
    optimizationPlanAssets: EXAM_MATE_OPTIMIZATION_EXPECTED.totalAssets,
    optimizationSelectedWebp: EXAM_MATE_OPTIMIZATION_EXPECTED.optimizedWebp,
    optimizationRetainedPng: EXAM_MATE_OPTIMIZATION_EXPECTED.retainedPng,
    optimizationRetainedAfterError:
      EXAM_MATE_OPTIMIZATION_EXPECTED.retainedAfterOptimizerError,
  };

  const critical = findings.filter((row) => row.severity === 'critical');
  return {
    ...normalized,
    importerVersion: 'exam-mate-1.1.0-optimized',
    archiveIdentifier: `${normalized.archiveIdentifier}+lossless-optimization-20260730`,
    sourceArchiveSha256: normalized.archiveSha256,
    archiveSha256: combinedArchiveSha256,
    optimizationAuditSha256: EXAM_MATE_OPTIMIZATION_AUDIT_SHA256,
    optimizationChecksumsSha256: EXAM_MATE_OPTIMIZATION_CHECKSUMS_SHA256,
    optimizationPlanSha256: EXAM_MATE_OPTIMIZATION_PLAN_SHA256,
    optimizationRowsSha256: EXAM_MATE_OPTIMIZATION_ROWS_SHA256,
    expectedCounts,
    actualCounts,
    verificationStatus: critical.length ? 'failed' : 'passed',
    findings,
    source: {
      ...normalized.source,
      assetRoot,
      originalVerifiedAssetByUrl: normalized.source.verifiedAssetByUrl,
      verifiedAssetByUrl: mappedByUrl,
      usedPhysicalHashes: new Set(usedSelectedByHash.keys()),
      optimizationAudit,
      optimizationUsedFallbacks: usedFallbacks,
    },
  };
}

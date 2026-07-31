#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { getPrivateR2Object } from './r2-s3.mjs';
import {
  createImportClient,
  resolveQuestionBankBucket,
  verifyProduction,
  verifyR2Head,
} from './import-exam-mate-question-bank-optimized.mjs';
import {
  fetchAll,
  normalizeExamMateArchive,
  resolveExamMateArchive,
  resolveExamMateForProduction,
} from './question-bank/exam-mate.mjs';
import {
  applyExamMateOptimizationPlan,
  loadExamMateOptimizationAudit,
  resolveExamMateOptimizationAudit,
} from './question-bank/exam-mate-optimization.mjs';
import { selectedFileSignature } from './verify-exam-mate-staging.mjs';

function parseArguments(argv) {
  const options = {
    archive: null,
    optimizationAudit: null,
    storageBucket: null,
    allowSharedPrivateBucket: false,
    resumeBatchId: null,
    workers: 8,
    report: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--archive') options.archive = argv[++index];
    else if (token === '--optimization-audit')
      options.optimizationAudit = argv[++index];
    else if (token === '--storage-bucket')
      options.storageBucket = argv[++index];
    else if (token === '--allow-shared-private-bucket')
      options.allowSharedPrivateBucket = true;
    else if (token === '--resume-batch-id')
      options.resumeBatchId = argv[++index];
    else if (token === '--workers')
      options.workers = Number(argv[++index]);
    else if (token === '--report') options.report = argv[++index];
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.archive) throw new Error('--archive is required.');
  if (!options.optimizationAudit)
    throw new Error('--optimization-audit is required.');
  if (
    !Number.isInteger(options.workers) ||
    options.workers < 1 ||
    options.workers > 16
  ) {
    throw new Error('--workers must be an integer from 1 to 16.');
  }
  return options;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signatureFormat(asset) {
  if (asset.content_type === 'image/webp') return 'webp';
  if (asset.content_type === 'image/png') return 'png';
  if (asset.content_type === 'image/bmp') return 'bmp';
  return null;
}

function redactedFailure(asset, code, details = {}) {
  return {
    assetIdHash: sha256(String(asset.id)),
    contentHash: asset.content_hash,
    code,
    ...details,
  };
}

async function readAndDecodeAsset(asset, bucket) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await getPrivateR2Object({
        bucket,
        key: asset.storage_key,
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        throw Object.assign(
          new Error(`private object returned status ${response.status}`),
          { statusCode: response.status },
        );
      }
      if (!verifyR2Head(asset, response)) {
        return redactedFailure(asset, 'metadata_mismatch', {
          status: response.status,
        });
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength !== Number(asset.byte_size)) {
        return redactedFailure(asset, 'byte_count_mismatch', {
          expectedBytes: Number(asset.byte_size),
          actualBytes: body.byteLength,
        });
      }
      const digest = sha256(body);
      if (digest !== asset.content_hash) {
        return redactedFailure(asset, 'sha256_mismatch', {
          actualHash: digest,
        });
      }
      const format = signatureFormat(asset);
      if (!format || !selectedFileSignature(body.subarray(0, 12), format)) {
        return redactedFailure(asset, 'file_signature_mismatch', {
          expectedContentType: asset.content_type,
        });
      }
      const metadata = await sharp(body, {
        failOn: 'error',
        limitInputPixels: false,
      }).metadata();
      if (!metadata.width || !metadata.height) {
        return redactedFailure(asset, 'missing_image_dimensions');
      }
      await sharp(body, {
        failOn: 'error',
        limitInputPixels: false,
      })
        .raw()
        .toBuffer();
      return {
        ok: true,
        bytes: body.byteLength,
        contentType: asset.content_type,
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 750),
        );
      }
    }
  }
  return redactedFailure(asset, 'read_or_decode_failed', {
    status: Number(lastError?.statusCode || 0),
    error: String(lastError?.message || lastError).slice(0, 300),
  });
}

async function auditObjectBodies(normalized, client, options) {
  const expectedAssetIds = new Set(
    normalized.productionExpectations.assetIds,
  );
  const allAssets = await fetchAll(
    client,
    'dp_qb_assets',
    'id,content_hash,content_type,byte_size,storage_provider,storage_bucket,storage_key,upload_status,verification_status',
  );
  const assets = allAssets
    .filter((row) => expectedAssetIds.has(row.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const bucket = resolveQuestionBankBucket(options);
  const relationshipFailures = assets.filter(
    (asset) =>
      asset.storage_provider !== 'r2' ||
      asset.storage_bucket !== bucket ||
      asset.upload_status !== 'uploaded' ||
      asset.verification_status !== 'verified' ||
      !String(asset.storage_key || '').startsWith(
        'question-bank/assets/sha256/',
      ),
  );
  if (assets.length !== expectedAssetIds.size || relationshipFailures.length) {
    return {
      status: 'failed',
      expectedObjects: expectedAssetIds.size,
      objectsSelected: assets.length,
      objectsVerified: 0,
      bytesVerified: 0,
      relationshipFailures: relationshipFailures.length,
      failures: relationshipFailures.slice(0, 20).map((asset) =>
        redactedFailure(asset, 'database_storage_state_mismatch'),
      ),
    };
  }

  const results = new Array(assets.length);
  let next = 0;
  let complete = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= assets.length) return;
      results[index] = await readAndDecodeAsset(assets[index], bucket);
      complete += 1;
      if (complete % 500 === 0 || complete === assets.length) {
        const failed = results.filter(
          (result) => result && !result.ok,
        ).length;
        process.stdout.write(
          `Exam-Mate full object audit ${complete}/${assets.length}; failures ${failed}\n`,
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: options.workers }, () => worker()),
  );

  const failures = results.filter((result) => !result.ok);
  const verified = results.filter((result) => result.ok);
  const contentTypes = {};
  let bytesVerified = 0;
  let maximumWidth = 0;
  let maximumHeight = 0;
  for (const result of verified) {
    bytesVerified += result.bytes;
    contentTypes[result.contentType] =
      (contentTypes[result.contentType] || 0) + 1;
    maximumWidth = Math.max(maximumWidth, result.width);
    maximumHeight = Math.max(maximumHeight, result.height);
  }
  return {
    status: failures.length ? 'failed' : 'passed',
    expectedObjects: expectedAssetIds.size,
    objectsSelected: assets.length,
    objectsVerified: verified.length,
    bytesVerified,
    relationshipFailures: 0,
    corruptOrUnreadableObjects: failures.length,
    contentTypes,
    maximumWidth,
    maximumHeight,
    failures: failures.slice(0, 20),
  };
}

async function saveReport(filePath, report) {
  if (!filePath) return;
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourceArchive = await resolveExamMateArchive(options.archive);
  const optimizationArchive = await resolveExamMateOptimizationAudit(
    options.optimizationAudit,
  );
  try {
    const [source, optimizationAudit] = await Promise.all([
      normalizeExamMateArchive(sourceArchive.root, {
        assetRoot: sourceArchive.assetRoot,
        requireLocalAssets: false,
        verifyLocalAssets: false,
      }),
      loadExamMateOptimizationAudit(optimizationArchive.root),
    ]);
    const optimized = await applyExamMateOptimizationPlan(
      source,
      optimizationAudit,
      {
        assetRoot: sourceArchive.assetRoot,
        requireLocalAssets: false,
        verifyLocalAssets: false,
      },
    );
    const client = createImportClient();
    const normalized = await resolveExamMateForProduction(
      optimized,
      client,
      {
        storageProvider: 'r2',
        storageBucket: resolveQuestionBankBucket(options),
        recoveryBatchId: options.resumeBatchId,
      },
    );
    const recoveryCounts = Object.fromEntries(
      Object.entries(normalized.recoveryPlan).map(([name, rows]) => [
        name,
        rows.length,
      ]),
    );
    const pendingRecoveryOperations = Object.values(recoveryCounts).reduce(
      (total, count) => total + count,
      0,
    );
    const relationshipVerification =
      normalized.verificationStatus === 'passed' &&
      pendingRecoveryOperations === 0
        ? await verifyProduction(normalized, {
            ...options,
            client,
            storageBucket: resolveQuestionBankBucket(options),
          })
        : {
            status: 'blocked',
            reason:
              normalized.verificationStatus !== 'passed'
                ? 'source_or_resolution_verification_failed'
                : 'database_recovery_not_idempotent',
          };
    const objectVerification =
      relationshipVerification.status === 'passed'
        ? await auditObjectBodies(normalized, client, options)
        : {
            status: 'blocked',
            reason: 'relationship_verification_failed',
          };
    const report = {
      verificationStatus:
        normalized.verificationStatus === 'passed' &&
        pendingRecoveryOperations === 0 &&
        relationshipVerification.status === 'passed' &&
        objectVerification.status === 'passed'
          ? 'passed'
          : 'failed',
      sourceArchiveSha256: normalized.sourceArchiveSha256,
      optimizationAuditSha256: normalized.optimizationAuditSha256,
      expectedQuestions:
        normalized.source.importableQuestions.length,
      expectedAssets:
        normalized.productionExpectations.assetIds.length,
      sourceAndResolutionStatus: normalized.verificationStatus,
      criticalResolutionFindings: normalized.findings.filter(
        (finding) => finding.severity === 'critical',
      ).length,
      recoveryCounts,
      pendingRecoveryOperations,
      relationshipVerification,
      objectVerification,
    };
    await saveReport(options.report, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.verificationStatus !== 'passed') process.exitCode = 1;
  } finally {
    await Promise.all([
      sourceArchive.cleanup(),
      optimizationArchive.cleanup(),
    ]);
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

#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import {
  getPrivateR2Object,
  headPrivateR2Bucket,
  headPrivateR2Object,
  listPrivateR2Objects,
  putPrivateR2Object,
} from './r2-s3.mjs';
import { deterministicUuid } from './question-bank/archive.mjs';
import {
  normalizeExamMateArchive,
  publicExamMateReport,
  resolveExamMateArchive,
  resolveExamMateForProduction,
  strictQuestionSignature,
} from './question-bank/exam-mate.mjs';
import {
  applyExamMateOptimizationPlan,
  loadExamMateOptimizationAudit,
  resolveExamMateOptimizationAudit,
} from './question-bank/exam-mate-optimization.mjs';

const WRITE_MODES = new Set([
  'database',
  'database-verify',
  'assets',
  'all',
]);
const MODES = new Set([
  'audit',
  'dry-run',
  'database',
  'database-verify',
  'assets',
  'all',
  'verify',
]);

const TABLES = [
  ['dp_qb_subjects', 'subjects', 'id'],
  ['dp_qb_courses', 'courses', 'id'],
  ['dp_qb_datasets', 'datasets', 'id'],
  ['dp_qb_topics', 'topics', 'id'],
  ['dp_qb_subtopics', 'subtopics', 'id'],
  ['dp_qb_papers', 'papers', 'id'],
  ['dp_qb_course_papers', 'coursePapers', 'course_id,paper_id'],
  ['dp_qb_questions', 'questions', 'id'],
  ['dp_qb_question_sources', 'questionSources', 'id'],
  ['dp_qb_question_variants', 'variants', 'id'],
  ['dp_qb_variant_sources', 'variantSources', 'id'],
  ['dp_qb_question_subtopics', 'placements', 'variant_id,subtopic_id'],
  ['dp_qb_variant_papers', 'variantPapers', 'variant_id,paper_id'],
  ['dp_qb_assets', 'assets', 'id'],
  ['dp_qb_asset_sources', 'assetSources', 'id'],
  ['dp_qb_variant_assets', 'variantAssets', 'variant_id,asset_id,role'],
  ['dp_qb_question_search', 'searchDocuments', 'variant_id'],
];

const NO_BATCH_COLUMNS = new Set([
  'dp_qb_course_papers',
  'dp_qb_question_search',
]);
const UPDATE_EXISTING_TABLES = new Set([
  'dp_qb_assets',
  'dp_qb_question_search',
]);
const PAGED_ORDER_COLUMNS = new Map([
  ['dp_qb_question_sources', ['id']],
  ['dp_qb_variant_sources', ['id']],
  ['dp_qb_question_variants', ['id']],
  ['dp_qb_questions', ['id']],
  ['dp_qb_papers', ['id']],
  ['dp_qb_question_subtopics', ['variant_id', 'subtopic_id']],
  ['dp_qb_course_papers', ['course_id', 'paper_id']],
  ['dp_qb_variant_papers', ['variant_id', 'paper_id']],
  ['dp_qb_assets', ['id']],
  ['dp_qb_asset_sources', ['id']],
  ['dp_qb_variant_assets', ['variant_id', 'asset_id', 'role']],
  ['dp_qb_question_search', ['variant_id']],
  ['dp_qb_import_batches', ['id']],
  ['dp_qb_import_findings', ['id']],
]);

function usage() {
  return `
DP Resources audited and locally optimized Exam-Mate question-bank importer

Usage:
  node scripts/import-exam-mate-question-bank-optimized.mjs \\
    --archive <source-audit-zip> \\
    --optimization-audit <optimization-audit-zip> \\
    --mode <mode> [options]

Modes:
  audit       Verify both pinned audits and the complete optimization mapping.
  dry-run     Resolve optimized rows against production without writing.
  database    Append missing Supabase rows (requires --confirm-production).
  database-verify
              Repair Supabase rows and run scoped production verification
              without re-uploading already verified objects.
  assets      Upload/read-back verify selected local assets (requires --assets-root and --confirm-production).
  all         Database, selected asset upload and scoped production verification.
  verify      Read-only production verification.

Options:
  --assets-root <path>          Full local ExamMate-index-* directory.
  --workers <n>                 R2 upload concurrency (default: 8, max: 16).
  --batch-size <n>              Supabase upsert batch size (default: 250).
  --storage-bucket <name>       Private R2 bucket override.
  --allow-shared-private-bucket Allow an explicit bucket override to use the
                                existing private PDF-preview bucket.
  --resume-batch-id <uuid>      Resume this exact failed logical batch.
  --report <path>               JSON report output path.
  --confirm-production          Required for database/R2 writes.
  --help                        Show this help.

The importer uploads the selected paths from index/asset-upload-plan.ndjson:
31,328 lossless WebP files and 8 exact verified original PNG files.
`;
}

export function parseArguments(argv) {
  const options = {
    archive: null,
    optimizationAudit: null,
    assetsRoot: null,
    mode: 'audit',
    workers: 8,
    batchSize: 250,
    storageBucket: null,
    allowSharedPrivateBucket: false,
    resumeBatchId: null,
    report: null,
    confirmProduction: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--archive') options.archive = argv[++index];
    else if (token === '--optimization-audit') options.optimizationAudit = argv[++index];
    else if (token === '--assets-root') options.assetsRoot = argv[++index];
    else if (token === '--mode') options.mode = argv[++index];
    else if (token === '--workers') options.workers = Number(argv[++index]);
    else if (token === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (token === '--storage-bucket') options.storageBucket = argv[++index];
    else if (token === '--allow-shared-private-bucket')
      options.allowSharedPrivateBucket = true;
    else if (token === '--resume-batch-id') options.resumeBatchId = argv[++index];
    else if (token === '--report') options.report = argv[++index];
    else if (token === '--confirm-production') options.confirmProduction = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!MODES.has(options.mode)) throw new Error(`Unsupported mode: ${options.mode}`);
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 16) {
    throw new Error('--workers must be an integer from 1 to 16.');
  }
  if (
    !Number.isInteger(options.batchSize) ||
    options.batchSize < 25 ||
    options.batchSize > 500
  ) {
    throw new Error('--batch-size must be an integer from 25 to 500.');
  }
  if (WRITE_MODES.has(options.mode) && !options.confirmProduction) {
    throw new Error(
      `${options.mode} can modify production data or R2. Audit and dry-run first, then rerun with --confirm-production.`,
    );
  }
  if ((options.mode === 'assets' || options.mode === 'all') && !options.assetsRoot) {
    throw new Error('--assets-root is required for assets/all mode.');
  }
  if (
    options.resumeBatchId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      options.resumeBatchId,
    )
  ) {
    throw new Error('--resume-batch-id must be a UUID.');
  }
  if (
    options.allowSharedPrivateBucket &&
    !options.storageBucket?.trim()
  ) {
    throw new Error(
      '--allow-shared-private-bucket requires an explicit --storage-bucket.',
    );
  }
  return options;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for this operation.`);
  return value;
}

export function createImportClient() {
  return createClient(
    requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { 'X-Client-Info': 'dp-resources-exam-mate-optimized-importer' },
      },
    },
  );
}

export function resolveQuestionBankBucket(options = {}) {
  const bucket =
    options.storageBucket?.trim() ||
    process.env.R2_QUESTION_BANK_BUCKET?.trim() ||
    '';
  if (!bucket) {
    throw new Error(
      'R2_QUESTION_BANK_BUCKET is required; Question Bank assets never fall back to PDF preview storage.',
    );
  }
  const previewBucket = process.env.R2_PDF_PREVIEW_BUCKET?.trim();
  const sharesPreviewBucket =
    bucket === 'dp-pdf-previews' ||
    (previewBucket && bucket === previewBucket);
  if (
    sharesPreviewBucket &&
    !(
      options.allowSharedPrivateBucket === true &&
      options.storageBucket?.trim() === bucket
    )
  ) {
    throw new Error(
      'Question Bank assets can use the private PDF preview bucket only with an explicit --storage-bucket and --allow-shared-private-bucket.',
    );
  }
  return bucket;
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function databaseRow(row, batchId, table) {
  const output = { ...row };
  delete output.local_path;
  if (!NO_BATCH_COLUMNS.has(table)) {
    output.created_by_batch_id = row.created_by_batch_id || batchId;
    output.last_seen_batch_id = batchId;
  }
  return output;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function upsertConflictKey(row, columns) {
  return columns.map((column) => String(row?.[column] ?? '')).join('\u0000');
}

export function deduplicateRowsForUpsert(
  table,
  rows,
  conflict,
  updateExisting = false,
) {
  const columns = String(conflict)
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
  if (!columns.length) throw new Error(`${table} has no upsert conflict columns.`);

  const byKey = new Map();
  let duplicateRowsRemoved = 0;
  let mergedRows = 0;
  for (const row of rows) {
    const key = upsertConflictKey(row, columns);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    duplicateRowsRemoved += 1;
    if (table === 'dp_qb_question_search') {
      const existingComparable = { ...existing };
      const rowComparable = { ...row };
      delete existingComparable.search_text;
      delete rowComparable.search_text;
      if (canonicalJson(existingComparable) !== canonicalJson(rowComparable)) {
        throw new Error(
          `${table} duplicate conflict key has incompatible non-search fields (${columns.join(',')}).`,
        );
      }
      const mergedSearchText = [...new Set(
        [existing.search_text, row.search_text]
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      )]
        .sort((left, right) => left.localeCompare(right))
        .join('\n');
      if (mergedSearchText !== existing.search_text) mergedRows += 1;
      byKey.set(key, { ...row, search_text: mergedSearchText });
      continue;
    }

    if (canonicalJson(existing) !== canonicalJson(row)) {
      throw new Error(
        `${table} duplicate conflict key has incompatible rows (${columns.join(',')}).`,
      );
    }
    if (updateExisting) byKey.set(key, row);
  }

  return {
    rows: [...byKey.values()],
    stats: {
      inputRows: rows.length,
      processedRows: byKey.size,
      duplicateRowsRemoved,
      mergedRows,
      rule:
        table === 'dp_qb_question_search'
          ? 'compatible-search-text-merge'
          : updateExisting
            ? 'validated-last-write-wins'
            : 'validated-first-write-wins',
    },
  };
}

async function retry(operation, attempts = 4) {
  let latest;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      latest = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw latest;
}

async function upsertRows(
  client,
  table,
  rows,
  conflict,
  batchSize,
  batchId,
  updateExisting = false,
) {
  const prepared = deduplicateRowsForUpsert(
    table,
    rows.map((row) => databaseRow(row, batchId, table)),
    conflict,
    updateExisting,
  );
  let processed = 0;
  for (const group of chunks(prepared.rows, batchSize)) {
    const { error } = await retry(() =>
      client.from(table).upsert(group, {
        onConflict: conflict,
        ignoreDuplicates: !updateExisting,
      }),
    );
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    processed += group.length;
  }
  return { ...prepared.stats, processedRows: processed };
}

export function validateBatchResume(existing, resumeBatchId, mode) {
  if (resumeBatchId && existing.id !== resumeBatchId) {
    throw new Error(
      `Refusing to resume batch ${existing.id}; --resume-batch-id selected ${resumeBatchId}.`,
    );
  }
  if (!resumeBatchId && WRITE_MODES.has(mode)) {
    throw new Error(
      `Existing logical batch ${existing.id} requires --resume-batch-id for a production retry.`,
    );
  }
  if (existing.status !== 'failed') {
    throw new Error(
      `Import batch ${existing.id} has status ${existing.status}; this recovery accepts only the exact failed batch.`,
    );
  }
  return existing.id;
}

async function createOrResumeBatch(
  client,
  normalized,
  mode,
  resumeBatchId = null,
) {
  const batchMode =
    mode === 'database-verify'
      ? 'all'
      : mode === 'dry-run'
        ? 'dry_run'
        : mode;
  const payload = {
    archive_identifier: normalized.archiveIdentifier,
    archive_sha256: normalized.archiveSha256,
    importer_version: normalized.importerVersion,
    mode: batchMode,
    status: 'importing',
    expected_counts: normalized.expectedCounts,
    actual_counts: normalized.actualCounts,
    operation_counts: {},
    final_report: {
      sourceArchiveSha256: normalized.sourceArchiveSha256,
      optimizationAuditSha256: normalized.optimizationAuditSha256,
    },
    verification_status: normalized.verificationStatus,
    completed_at: null,
  };
  const { data: existing, error: existingError } = await client
    .from('dp_qb_import_batches')
    .select('id,status')
    .eq('archive_sha256', payload.archive_sha256)
    .eq('importer_version', payload.importer_version)
    .eq('mode', payload.mode)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Unable to inspect import batch: ${existingError.message}`);
  }

  if (existing) {
    validateBatchResume(existing, resumeBatchId, mode);
    const { data, error } = await client
      .from('dp_qb_import_batches')
      .update(payload)
      .eq('id', existing.id)
      .eq('status', 'failed')
      .select('id')
      .single();
    if (error) throw new Error(`Unable to resume import batch: ${error.message}`);
    return data.id;
  }

  if (resumeBatchId) {
    throw new Error(
      `The requested resume batch ${resumeBatchId} does not match the pinned archive identity.`,
    );
  }
  const { data, error } = await client
    .from('dp_qb_import_batches')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw new Error(`Unable to create import batch: ${error.message}`);
  return data.id;
}

async function storeFindings(client, normalized, batchId, batchSize) {
  const rows = normalized.findings.map((finding) => ({
    ...finding,
    id: deterministicUuid(`batch-finding:${batchId}:${finding.id}`),
    batch_id: batchId,
  }));
  for (const group of chunks(rows, batchSize)) {
    const { error } = await client
      .from('dp_qb_import_findings')
      .upsert(group, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`Import findings upsert failed: ${error.message}`);
  }
  return rows.length;
}

async function deleteExactRecoveryRows(
  client,
  table,
  rows,
  columns,
  batchId,
  requireBatchOwnership,
) {
  let deletedRows = 0;
  const ordered = [...rows].sort((left, right) =>
    upsertConflictKey(left, columns).localeCompare(
      upsertConflictKey(right, columns),
    ),
  );
  for (const row of ordered) {
    const deleted = await retry(async () => {
      let query = client.from(table).delete();
      for (const column of columns) query = query.eq(column, row[column]);
      if (requireBatchOwnership) {
        query = query.eq('created_by_batch_id', batchId);
      }
      const { data, error } = await query.select(columns.join(','));
      if (error) {
        throw new Error(
          `${table} recovery cleanup failed: ${error.message}`,
        );
      }
      return data || [];
    });
    if (deleted.length !== 1) {
      throw new Error(
        `${table} recovery cleanup expected one exact row but deleted ${deleted.length}.`,
      );
    }
    deletedRows += 1;
  }
  return deletedRows;
}

export async function applyPartialBatchRecovery(
  client,
  normalized,
  batchId,
  batchSize,
) {
  const plan = normalized.recoveryPlan || {};
  const result = { updates: {}, deletes: {} };
  result.deletes.dp_qb_question_variants = await deleteExactRecoveryRows(
    client,
    'dp_qb_question_variants',
    plan.deleteVariants || [],
    ['id'],
    batchId,
    true,
  );

  const updates = [
    [
      'dp_qb_question_sources',
      plan.questionSourceUpdates || [],
      'id',
    ],
    [
      'dp_qb_question_variants',
      plan.variantUpdates || [],
      'id',
    ],
    [
      'dp_qb_variant_sources',
      plan.variantSourceUpdates || [],
      'id',
    ],
    [
      'dp_qb_asset_sources',
      plan.assetSourceUpdates || [],
      'id',
    ],
    [
      'dp_qb_variant_assets',
      plan.variantAssetUpdates || [],
      'variant_id,asset_id,role',
    ],
  ];
  for (const [table, rows, conflict] of updates) {
    result.updates[table] = await upsertRows(
      client,
      table,
      rows,
      conflict,
      batchSize,
      batchId,
      true,
    );
  }

  const deletes = [
    [
      'dp_qb_question_subtopics',
      plan.deletePlacements || [],
      ['variant_id', 'subtopic_id'],
      true,
    ],
    [
      'dp_qb_variant_assets',
      plan.deleteVariantAssets || [],
      ['variant_id', 'asset_id', 'role'],
      true,
    ],
    [
      'dp_qb_variant_papers',
      plan.deleteVariantPapers || [],
      ['variant_id', 'paper_id'],
      true,
    ],
    [
      'dp_qb_course_papers',
      plan.deleteCoursePapers || [],
      ['course_id', 'paper_id'],
      false,
    ],
    [
      'dp_qb_papers',
      plan.deletePapers || [],
      ['id'],
      true,
    ],
  ];
  for (const [table, rows, columns, requireBatchOwnership] of deletes) {
    result.deletes[table] = await deleteExactRecoveryRows(
      client,
      table,
      rows,
      columns,
      batchId,
      requireBatchOwnership,
    );
  }
  return result;
}

async function importDatabase(normalized, options) {
  if (normalized.verificationStatus !== 'passed') {
    throw new Error('Database import refused because normalization failed.');
  }
  const client = options.client;
  const batchId = await createOrResumeBatch(
    client,
    normalized,
    options.mode,
    options.resumeBatchId,
  );
  const operationCounts = {};
  try {
    for (const [table, rowKey, conflict] of TABLES) {
      const rows = normalized.rows[rowKey] || [];
      operationCounts[table] = await upsertRows(
        client,
        table,
        rows,
        conflict,
        options.batchSize,
        batchId,
        UPDATE_EXISTING_TABLES.has(table),
      );
      process.stdout.write(
        `${table}: ${operationCounts[table].processedRows} row(s) processed; ` +
          `${operationCounts[table].duplicateRowsRemoved} duplicate input row(s) normalized\n`,
      );
    }
    operationCounts.partial_batch_recovery =
      await applyPartialBatchRecovery(
        client,
        normalized,
        batchId,
        options.batchSize,
      );
    operationCounts.dp_qb_import_findings = await storeFindings(
      client,
      normalized,
      batchId,
      options.batchSize,
    );
    const { error } = await client
      .from('dp_qb_import_batches')
      .update({
        status: 'importing',
        operation_counts: operationCounts,
        actual_counts: normalized.actualCounts,
        final_report: {
          stage: 'database_complete',
          sourceArchiveSha256: normalized.sourceArchiveSha256,
          optimizationAuditSha256: normalized.optimizationAuditSha256,
          combinedArchiveSha256: normalized.archiveSha256,
        },
        verification_status: 'passed',
      })
      .eq('id', batchId);
    if (error) throw new Error(`Unable to update import batch: ${error.message}`);
    return { batchId, operationCounts };
  } catch (error) {
    await client
      .from('dp_qb_import_batches')
      .update({
        status: 'failed',
        final_report: { stage: 'database', error: String(error.message || error) },
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    throw error;
  }
}

async function verifyR2Body(asset, response) {
  if (!response.ok) return false;
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength !== Number(asset.byte_size)) return false;
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  return digest === asset.content_hash;
}

function normalizedContentType(value) {
  return String(value || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

export function verifyR2Head(asset, response) {
  if (!response?.ok) return false;
  const contentLength = Number(response.headers.get('content-length'));
  const contentType = normalizedContentType(response.headers.get('content-type'));
  const sha256Metadata = String(
    response.headers.get('x-amz-meta-sha256') || '',
  ).toLowerCase();
  return (
    contentLength === Number(asset.byte_size) &&
    contentType === normalizedContentType(asset.content_type) &&
    sha256Metadata === String(asset.content_hash).toLowerCase()
  );
}

async function readVerifiedLocalAsset(asset) {
  const body = await readFile(asset.local_path);
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  if (digest !== asset.content_hash || body.byteLength !== Number(asset.byte_size)) {
    throw new Error(`Local selected asset verification failed for ${asset.content_hash}.`);
  }
  return body;
}

async function uploadOneAsset(asset) {
  const existingHead = await headPrivateR2Object({
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    signal: AbortSignal.timeout(45_000),
  });
  if (verifyR2Head(asset, existingHead)) {
    return { status: 'verified_existing_object', asset };
  }

  let existingBodyVerified = false;
  if (existingHead.status !== 404) {
    const existingBody = await getPrivateR2Object({
      bucket: asset.storage_bucket,
      key: asset.storage_key,
      signal: AbortSignal.timeout(60_000),
    });
    existingBodyVerified = await verifyR2Body(asset, existingBody);
  }

  const body = await readVerifiedLocalAsset(asset);
  await putPrivateR2Object({
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    body,
    contentType: asset.content_type,
    cacheControl: 'private, max-age=31536000, immutable',
    sha256Metadata: asset.content_hash,
    signal: AbortSignal.timeout(60_000),
  });
  const stored = await headPrivateR2Object({
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    signal: AbortSignal.timeout(60_000),
  });
  if (!verifyR2Head(asset, stored)) {
    throw new Error(
      `R2 size/content-type/checksum-metadata verification failed for ${asset.storage_key}.`,
    );
  }
  return {
    status: existingBodyVerified
      ? 'metadata_repaired_verified'
      : 'uploaded_verified',
    asset,
  };
}

async function updateAssetStates(client, results, batchSize) {
  const now = new Date().toISOString();
  const successful = results
    .filter((result) => result.status !== 'failed')
    .map((result) => ({
      id: result.asset.id,
      content_hash: result.asset.content_hash,
      canonical_source_path: result.asset.canonical_source_path,
      original_filename: result.asset.original_filename,
      file_extension: result.asset.file_extension,
      content_type: result.asset.content_type,
      byte_size: result.asset.byte_size,
      storage_provider: result.asset.storage_provider,
      storage_bucket: result.asset.storage_bucket,
      storage_key: result.asset.storage_key,
      upload_status: 'uploaded',
      verification_status: 'verified',
      uploaded_at: now,
      verified_at: now,
      last_error: null,
    }));
  const failed = results
    .filter((result) => result.status === 'failed')
    .map((result) => ({
      id: result.asset.id,
      content_hash: result.asset.content_hash,
      canonical_source_path: result.asset.canonical_source_path,
      original_filename: result.asset.original_filename,
      file_extension: result.asset.file_extension,
      content_type: result.asset.content_type,
      byte_size: result.asset.byte_size,
      storage_provider: result.asset.storage_provider,
      storage_bucket: result.asset.storage_bucket,
      storage_key: result.asset.storage_key,
      upload_status: 'failed',
      verification_status: 'failed',
      last_error: String(result.error || 'Unknown upload failure').slice(0, 1000),
    }));

  for (const group of chunks([...successful, ...failed], batchSize)) {
    const { error } = await client
      .from('dp_qb_assets')
      .upsert(group, { onConflict: 'id' });
    if (error) throw new Error(`Unable to persist asset verification: ${error.message}`);
  }
}

async function uploadAssets(normalized, options) {
  if (normalized.verificationStatus !== 'passed') {
    throw new Error('Asset upload refused because normalization failed.');
  }
  const candidates = normalized.rows.assetUploadCandidates;
  const bucket = resolveQuestionBankBucket(options);
  const prefix = 'question-bank/assets/sha256/';
  const beforeObjects = await listAllPrivateR2Objects(bucket, prefix);
  const beforeKeys = new Set(beforeObjects.map((row) => row.key));
  const results = new Array(candidates.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const asset = candidates[index];
      try {
        results[index] = await retry(() => uploadOneAsset(asset), 3);
      } catch (error) {
        results[index] = {
          status: 'failed',
          asset,
          error: String(error.message || error),
        };
      }
      completed += 1;
      if (completed % 100 === 0 || completed === candidates.length) {
        const failures = results.filter((result) => result?.status === 'failed').length;
        process.stdout.write(
          `Exam-Mate selected R2 assets ${completed}/${candidates.length}; failures ${failures}\n`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: options.workers }, worker));
  await updateAssetStates(options.client, results, options.batchSize);
  const afterObjects = await listAllPrivateR2Objects(bucket, prefix);
  const afterKeys = new Set(afterObjects.map((row) => row.key));
  const expectedKeys = new Set(candidates.map((row) => row.storage_key));
  const missingExpectedKeys = [...expectedKeys].filter(
    (key) => !afterKeys.has(key),
  );
  const unexpectedNewKeys = [...afterKeys].filter(
    (key) => !beforeKeys.has(key) && !expectedKeys.has(key),
  );
  const counts = results.reduce((output, item) => {
    output[item.status] = (output[item.status] || 0) + 1;
    return output;
  }, {});
  const failures = results
    .filter((result) => result.status === 'failed')
    .map((result) => ({
      id: result.asset.id,
      key: result.asset.storage_key,
      error: result.error,
    }));
  if (missingExpectedKeys.length || unexpectedNewKeys.length) {
    failures.push({
      id: null,
      key: null,
      error:
        `R2 inventory mismatch: ${missingExpectedKeys.length} expected keys missing, ` +
        `${unexpectedNewKeys.length} unexpected new keys.`,
    });
  }
  return {
    provider: 'r2',
    bucket,
    counts,
    inventory: {
      prefix,
      beforeObjects: beforeObjects.length,
      afterObjects: afterObjects.length,
      addedObjects: [...afterKeys].filter((key) => !beforeKeys.has(key)).length,
      expectedKeys: expectedKeys.size,
      missingExpectedKeys: missingExpectedKeys.length,
      unexpectedNewKeys: unexpectedNewKeys.length,
      missingExpectedKeyHashes: missingExpectedKeys
        .slice(0, 20)
        .map((key) => crypto.createHash('sha256').update(key).digest('hex')),
      unexpectedNewKeyHashes: unexpectedNewKeys
        .slice(0, 20)
        .map((key) => crypto.createHash('sha256').update(key).digest('hex')),
    },
    failures,
    failed: failures.length,
  };
}

async function listAllPrivateR2Objects(bucket, prefix) {
  const objects = [];
  let continuationToken = null;
  do {
    const page = await listPrivateR2Objects({
      bucket,
      prefix,
      continuationToken,
      signal: AbortSignal.timeout(60_000),
    });
    objects.push(...page.objects);
    continuationToken = page.isTruncated
      ? page.nextContinuationToken
      : null;
    if (page.isTruncated && !continuationToken) {
      throw new Error('R2 listing was truncated without a continuation token.');
    }
  } while (continuationToken);
  return objects;
}

async function preflightPrivateR2Bucket(options) {
  const bucket = resolveQuestionBankBucket(options);
  await headPrivateR2Bucket({
    bucket,
    signal: AbortSignal.timeout(45_000),
  });
  return bucket;
}

async function fetchPaged(client, table, columns, applyFilters = (query) => query) {
  const output = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from(table).select(columns);
    query = applyFilters(query);
    const orderColumns = PAGED_ORDER_COLUMNS.get(table);
    if (!orderColumns) {
      throw new Error(`Stable verification order is not configured for ${table}.`);
    }
    for (const orderColumn of orderColumns) {
      query = query.order(orderColumn, { ascending: true });
    }
    query = query.range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) throw new Error(`${table} verification read failed: ${error.message}`);
    output.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return output;
}

async function verifyPrivateR2Assets(assets, workers) {
  const results = new Array(assets.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= assets.length) return;
      const asset = assets[index];
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          const response = await headPrivateR2Object({
            bucket: asset.storage_bucket,
            key: asset.storage_key,
            signal: AbortSignal.timeout(45_000),
          });
          results[index] = {
            asset,
            verified: verifyR2Head(asset, response),
            status: response.status,
          };
          break;
        } catch (error) {
          if (attempt === 4) {
            results[index] = {
              asset,
              verified: false,
              status: Number(error.statusCode || 0),
              error: String(error.message || error),
            };
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, attempt * 500),
          );
        }
      }
      completed += 1;
      if (completed % 500 === 0 || completed === assets.length) {
        const failed = results.filter((row) => row && !row.verified).length;
        process.stdout.write(
          `Exam-Mate private R2 verification ${completed}/${assets.length}; failures ${failed}\n`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

export async function verifyProduction(normalized, options) {
  const client = options.client;
  const expectations = normalized.productionExpectations;
  if (!expectations) {
    throw new Error('Production verification expectations are unavailable.');
  }
  const expectedSourceIds = normalized.source.importableQuestions.map(
    (row) => String(row.sourceQuestionId),
  );
  const expectedVariantKeys = normalized.productionExpectations.variantSourceKeys;
  const expectedHashes = new Set([...normalized.source.usedPhysicalHashes].map(String));

  const [
    questionSources,
    variantSources,
    variants,
    questions,
    papers,
    placements,
    coursePapers,
    variantPapers,
    assets,
    assetSources,
    variantAssets,
    searchDocuments,
    batches,
    importFindings,
  ] = await Promise.all([
    fetchPaged(
      client,
      'dp_qb_question_sources',
      'id,source_question_id,question_id,created_by_batch_id',
      (query) => query.eq('provider', 'exam_mate'),
    ),
    fetchPaged(
      client,
      'dp_qb_variant_sources',
      'id,source_question_id,source_course,source_topic,variant_id,created_by_batch_id',
      (query) => query.eq('provider', 'exam_mate'),
    ),
    fetchPaged(
      client,
      'dp_qb_question_variants',
      'id,question_id,dataset_id,course_id,topic_id,paper_id,source_index,source_occurrence,canonical_source_subtopic_id,render_status,render_issue_codes,created_by_batch_id',
    ),
    fetchPaged(
      client,
      'dp_qb_questions',
      'id,reference,content,mark_scheme,examiner_report,maximum_mark,content_hash,created_by_batch_id',
    ),
    fetchPaged(client, 'dp_qb_papers', 'id,created_by_batch_id'),
    fetchPaged(
      client,
      'dp_qb_question_subtopics',
      'variant_id,subtopic_id,created_by_batch_id',
    ),
    fetchPaged(client, 'dp_qb_course_papers', 'course_id,paper_id'),
    fetchPaged(
      client,
      'dp_qb_variant_papers',
      'variant_id,paper_id,created_by_batch_id',
    ),
    fetchPaged(
      client,
      'dp_qb_assets',
      'id,content_hash,content_type,byte_size,verification_status,storage_provider,storage_bucket,storage_key,created_by_batch_id',
    ),
    fetchPaged(
      client,
      'dp_qb_asset_sources',
      'id,asset_id,source_question_id,created_by_batch_id',
    ),
    fetchPaged(
      client,
      'dp_qb_variant_assets',
      'variant_id,asset_id,source_file_id,role,sort_order,alt_text,created_by_batch_id',
    ),
    fetchPaged(client, 'dp_qb_question_search', 'variant_id'),
    fetchPaged(
      client,
      'dp_qb_import_batches',
      'id,archive_sha256,importer_version,mode,status,verification_status,operation_counts,actual_counts,completed_at',
      (query) =>
        query
          .eq('archive_sha256', normalized.archiveSha256)
          .eq('importer_version', normalized.importerVersion),
    ),
    fetchPaged(
      client,
      'dp_qb_import_findings',
      'id,severity,batch_id',
      (query) => query.eq('severity', 'critical'),
    ),
  ]);

  const sourceSet = new Set(questionSources.map((row) => row.source_question_id));
  const variantSet = new Set(
    variantSources.map(
      (row) => `${row.source_question_id}:${row.source_course}:${row.source_topic}`,
    ),
  );
  const expectedBucket = resolveQuestionBankBucket(options);
  const expectedQuestionSourceRowIds = new Set(expectations.questionSourceIds);
  const expectedQuestionSourceQuestionIds =
    expectations.questionSourceQuestionIds || {};
  const expectedVariantSourceRowIds = new Set(expectations.variantSourceIds);
  const expectedVariantSourceVariantIds =
    expectations.variantSourceVariantIds || {};
  const expectedVariantIds = new Set(expectations.variantIds);
  const expectedVariantQuestionIds = expectations.variantQuestionIds || {};
  const expectedVariantPaperIds = expectations.variantPaperIds || {};
  const expectedPlacementKeys = new Set(expectations.placementKeys);
  const expectedCoursePaperKeys = new Set(expectations.coursePaperKeys);
  const expectedVariantPaperKeys = new Set(expectations.variantPaperKeys);
  const expectedPaperIds = new Set(expectations.paperIds);
  const expectedAssetIds = new Set(expectations.assetIds);
  const expectedAssetSourceIds = new Set(expectations.assetSourceIds);
  const expectedAssetSourceQuestionIds =
    expectations.assetSourceQuestionIds || {};
  const expectedVariantAssetKeys = new Set(expectations.variantAssetKeys);
  const expectedQuestionCoreContentHashes =
    expectations.questionCoreContentHashes || {};
  const expectedVariantDetails = expectations.variantDetails || {};
  const expectedVariantAssetDetails =
    expectations.variantAssetDetails || {};

  const questionSourceRowIds = new Set(questionSources.map((row) => row.id));
  const questionSourceById = new Map(
    questionSources.map((row) => [row.id, row]),
  );
  const variantSourceRowIds = new Set(variantSources.map((row) => row.id));
  const variantSourceById = new Map(
    variantSources.map((row) => [row.id, row]),
  );
  const variantById = new Map(variants.map((row) => [row.id, row]));
  const questionById = new Map(questions.map((row) => [row.id, row]));
  const variantIds = new Set(variants.map((row) => row.id));
  const paperIds = new Set(papers.map((row) => row.id));
  const placementKeys = new Set(
    placements.map((row) => `${row.variant_id}\u0000${row.subtopic_id}`),
  );
  const coursePaperKeys = new Set(
    coursePapers.map((row) => `${row.course_id}\u0000${row.paper_id}`),
  );
  const variantPaperKeys = new Set(
    variantPapers.map((row) => `${row.variant_id}\u0000${row.paper_id}`),
  );
  const assetIds = new Set(assets.map((row) => row.id));
  const assetSourceIds = new Set(assetSources.map((row) => row.id));
  const assetSourceById = new Map(
    assetSources.map((row) => [row.id, row]),
  );
  const variantAssetKeys = new Set(
    variantAssets.map(
      (row) => `${row.variant_id}\u0000${row.asset_id}\u0000${row.role}`,
    ),
  );
  const variantAssetByKey = new Map(
    variantAssets.map((row) => [
      `${row.variant_id}\u0000${row.asset_id}\u0000${row.role}`,
      row,
    ]),
  );
  const searchVariantIds = new Set(
    searchDocuments.map((row) => row.variant_id),
  );
  const examMateVariantIds = new Set(
    variantSources.map((row) => row.variant_id),
  );
  const matchingBatchIds = new Set(batches.map((row) => row.id));

  const missingQuestionSourceRows = [...expectedQuestionSourceRowIds].filter(
    (id) => !questionSourceRowIds.has(id),
  );
  const unexpectedQuestionSourceRows = [...questionSourceRowIds].filter(
    (id) => !expectedQuestionSourceRowIds.has(id),
  );
  const missingVariantSourceRows = [...expectedVariantSourceRowIds].filter(
    (id) => !variantSourceRowIds.has(id),
  );
  const unexpectedVariantSourceRows = [...variantSourceRowIds].filter(
    (id) => !expectedVariantSourceRowIds.has(id),
  );
  const missingVariants = [...expectedVariantIds].filter(
    (id) => !variantIds.has(id),
  );
  const mismatchedQuestionSources = Object.entries(
    expectedQuestionSourceQuestionIds,
  ).filter(
    ([id, questionId]) =>
      questionSourceById.get(id)?.question_id !== questionId,
  );
  const mismatchedVariantSources = Object.entries(
    expectedVariantSourceVariantIds,
  ).filter(
    ([id, variantId]) =>
      variantSourceById.get(id)?.variant_id !== variantId,
  );
  const mismatchedVariants = Object.entries(
    expectedVariantQuestionIds,
  ).filter(([id, questionId]) => {
    const variant = variantById.get(id);
    return (
      !variant ||
      variant.question_id !== questionId ||
      (variant.paper_id || null) !==
      (expectedVariantPaperIds[id] || null)
    );
  });
  const mismatchedQuestionCores = Object.entries(
    expectedQuestionCoreContentHashes,
  ).filter(([id, expectedHash]) => {
    const question = questionById.get(id);
    return (
      !question ||
      question.content_hash !== expectedHash ||
      strictQuestionSignature(question) !== expectedHash
    );
  });
  const mismatchedVariantDetails = Object.entries(
    expectedVariantDetails,
  ).filter(([id, expected]) => {
    const variant = variantById.get(id);
    return (
      !variant ||
      variant.question_id !== expected.questionId ||
      variant.dataset_id !== expected.datasetId ||
      variant.course_id !== expected.courseId ||
      variant.topic_id !== expected.topicId ||
      (variant.paper_id || null) !== (expected.paperId || null) ||
      Number(variant.source_index) !== expected.sourceIndex ||
      Number(variant.source_occurrence || 0) !==
        expected.sourceOccurrence ||
      (variant.canonical_source_subtopic_id || null) !==
        (expected.canonicalSourceSubtopicId || null)
    );
  });
  const nonReadyVariants = [...expectedVariantIds].filter((id) => {
    const variant = variantById.get(id);
    return (
      !variant ||
      variant.render_status !== 'ready' ||
      (variant.render_issue_codes || []).length !== 0
    );
  });
  const missingPlacements = [...expectedPlacementKeys].filter(
    (key) => !placementKeys.has(key),
  );
  const unexpectedExpectedPlacements = placements.filter(
    (row) =>
      expectedVariantIds.has(row.variant_id) &&
      !expectedPlacementKeys.has(
        `${row.variant_id}\u0000${row.subtopic_id}`,
      ),
  );
  const missingCoursePapers = [...expectedCoursePaperKeys].filter(
    (key) => !coursePaperKeys.has(key),
  );
  const missingVariantPapers = [...expectedVariantPaperKeys].filter(
    (key) => !variantPaperKeys.has(key),
  );
  const unexpectedExpectedVariantPapers = variantPapers.filter(
    (row) =>
      expectedVariantIds.has(row.variant_id) &&
      !expectedVariantPaperKeys.has(
        `${row.variant_id}\u0000${row.paper_id}`,
      ),
  );
  const missingAssetRows = [...expectedAssetIds].filter(
    (id) => !assetIds.has(id),
  );
  const missingAssetSources = [...expectedAssetSourceIds].filter(
    (id) => !assetSourceIds.has(id),
  );
  const mismatchedAssetSources = Object.entries(
    expectedAssetSourceQuestionIds,
  ).filter(
    ([id, questionId]) =>
      assetSourceById.get(id)?.source_question_id !== questionId,
  );
  const missingVariantAssets = [...expectedVariantAssetKeys].filter(
    (key) => !variantAssetKeys.has(key),
  );
  const mismatchedVariantAssets = Object.entries(
    expectedVariantAssetDetails,
  ).filter(([key, expected]) => {
    const row = variantAssetByKey.get(key);
    return (
      !row ||
      row.source_file_id !== expected.sourceFileId ||
      Number(row.sort_order) !== expected.sortOrder ||
      String(row.alt_text || '').trim() !== expected.altText
    );
  });
  const unexpectedExpectedVariantAssets = variantAssets.filter(
    (row) =>
      expectedVariantIds.has(row.variant_id) &&
      !expectedVariantAssetKeys.has(
        `${row.variant_id}\u0000${row.asset_id}\u0000${row.role}`,
      ),
  );
  const missingSearchDocuments = [...expectedVariantIds].filter(
    (id) => !searchVariantIds.has(id),
  );
  const unexpectedSearchDocuments = [...searchVariantIds].filter(
    (id) =>
      expectedVariantIds.has(id) === false &&
      examMateVariantIds.has(id),
  );
  const missingPapers = [...expectedPaperIds].filter(
    (id) => !paperIds.has(id),
  );
  const expectedQuestionIds = new Set(
    Object.values(expectedQuestionSourceQuestionIds),
  );
  const unexpectedQuestions = questions.filter(
    (row) =>
      matchingBatchIds.has(row.created_by_batch_id) &&
      !expectedQuestionIds.has(row.id),
  );
  const unexpectedVariants = variants.filter(
    (row) =>
      matchingBatchIds.has(row.created_by_batch_id) &&
      !expectedVariantIds.has(row.id),
  );
  const unexpectedPapers = papers.filter(
    (row) =>
      matchingBatchIds.has(row.created_by_batch_id) &&
      !expectedPaperIds.has(row.id),
  );
  const batchPaperIds = new Set(
    papers
      .filter((row) => matchingBatchIds.has(row.created_by_batch_id))
      .map((row) => row.id),
  );
  const unexpectedCoursePapers = coursePapers.filter(
    (row) =>
      batchPaperIds.has(row.paper_id) &&
      !expectedCoursePaperKeys.has(
        `${row.course_id}\u0000${row.paper_id}`,
      ),
  );
  const unexpectedPlacements = placements.filter(
    (row) =>
      matchingBatchIds.has(row.created_by_batch_id) &&
      !expectedPlacementKeys.has(
        `${row.variant_id}\u0000${row.subtopic_id}`,
      ),
  );
  const unexpectedVariantPapers = variantPapers.filter(
    (row) =>
      matchingBatchIds.has(row.created_by_batch_id) &&
      !expectedVariantPaperKeys.has(
        `${row.variant_id}\u0000${row.paper_id}`,
      ),
  );
  const unexpectedAssetRows = assets.filter(
    (row) =>
      matchingBatchIds.has(row.created_by_batch_id) &&
      !expectedAssetIds.has(row.id),
  );
  const unexpectedAssetSources = assetSources.filter(
    (row) =>
      matchingBatchIds.has(row.created_by_batch_id) &&
      !expectedAssetSourceIds.has(row.id),
  );
  const unexpectedVariantAssets = variantAssets.filter(
    (row) =>
      matchingBatchIds.has(row.created_by_batch_id) &&
      !expectedVariantAssetKeys.has(
        `${row.variant_id}\u0000${row.asset_id}\u0000${row.role}`,
      ),
  );

  const assetByHash = new Map(assets.map((row) => [row.content_hash, row]));
  const databaseVerifiedAssets = [...expectedHashes]
    .map((hash) => assetByHash.get(hash))
    .filter(
      (row) =>
        row &&
        row.verification_status === 'verified' &&
        row.storage_provider === 'r2' &&
        row.storage_bucket === expectedBucket &&
        String(row.storage_key || '').startsWith('question-bank/assets/sha256/'),
    );
  const r2Results = options.skipR2HeadVerification
    ? databaseVerifiedAssets.map((asset) => ({
        asset,
        verified: true,
        status: null,
        skipped: true,
      }))
    : await verifyPrivateR2Assets(
        databaseVerifiedAssets,
        options.workers,
      );
  const verifiedHashes = new Set(
    r2Results
      .filter((row) => row.verified)
      .map((row) => row.asset.content_hash),
  );
  const inventoryObjects = await listAllPrivateR2Objects(
    expectedBucket,
    'question-bank/assets/sha256/',
  );
  const inventoryKeys = new Set(inventoryObjects.map((row) => row.key));
  const expectedStorageKeys = new Set(
    databaseVerifiedAssets.map((row) => row.storage_key),
  );
  const missingInventoryKeys = [...expectedStorageKeys].filter(
    (key) => !inventoryKeys.has(key),
  );
  const unusedPlanKeys = new Set(
    normalized.source.optimizationAudit.planRows
      .filter((row) => !expectedHashes.has(row.selectedHash))
      .map(
        (row) =>
          `question-bank/assets/sha256/${row.selectedHash.slice(0, 2)}/` +
          `${row.selectedHash}.${row.selectedFormat}`,
      ),
  );
  const uploadedUnusedPlanKeys = [...unusedPlanKeys].filter((key) =>
    inventoryKeys.has(key),
  );

  const missingQuestionSources = expectedSourceIds.filter((id) => !sourceSet.has(id));
  const missingVariantSources = expectedVariantKeys.filter((key) => !variantSet.has(key));
  const missingAssets = [...expectedHashes].filter((hash) => !verifiedHashes.has(hash));
  const criticalImportFindings = importFindings.filter(
    (row) =>
      matchingBatchIds.has(row.batch_id) &&
      row.severity === 'critical',
  );
  const passed =
    missingQuestionSources.length === 0 &&
    missingVariantSources.length === 0 &&
    missingAssets.length === 0 &&
    missingInventoryKeys.length === 0 &&
    uploadedUnusedPlanKeys.length === 0 &&
    missingQuestionSourceRows.length === 0 &&
    unexpectedQuestionSourceRows.length === 0 &&
    missingVariantSourceRows.length === 0 &&
    unexpectedVariantSourceRows.length === 0 &&
    missingVariants.length === 0 &&
    mismatchedQuestionSources.length === 0 &&
    mismatchedVariantSources.length === 0 &&
    mismatchedVariants.length === 0 &&
    mismatchedQuestionCores.length === 0 &&
    mismatchedVariantDetails.length === 0 &&
    nonReadyVariants.length === 0 &&
    missingPlacements.length === 0 &&
    unexpectedExpectedPlacements.length === 0 &&
    missingCoursePapers.length === 0 &&
    missingVariantPapers.length === 0 &&
    unexpectedExpectedVariantPapers.length === 0 &&
    missingPapers.length === 0 &&
    missingAssetRows.length === 0 &&
    missingAssetSources.length === 0 &&
    mismatchedAssetSources.length === 0 &&
    missingVariantAssets.length === 0 &&
    mismatchedVariantAssets.length === 0 &&
    unexpectedExpectedVariantAssets.length === 0 &&
    missingSearchDocuments.length === 0 &&
    unexpectedSearchDocuments.length === 0 &&
    unexpectedQuestions.length === 0 &&
    unexpectedVariants.length === 0 &&
    unexpectedPapers.length === 0 &&
    unexpectedCoursePapers.length === 0 &&
    unexpectedPlacements.length === 0 &&
    unexpectedVariantPapers.length === 0 &&
    unexpectedAssetRows.length === 0 &&
    unexpectedAssetSources.length === 0 &&
    unexpectedVariantAssets.length === 0 &&
    criticalImportFindings.length === 0;

  return {
    status: passed ? 'passed' : 'failed',
    questionSources: expectedSourceIds.length - missingQuestionSources.length,
    expectedQuestionSources: expectedSourceIds.length,
    variantSources: expectedVariantKeys.length - missingVariantSources.length,
    expectedVariantSources: expectedVariantKeys.length,
    verifiedSelectedAssets: expectedHashes.size - missingAssets.length,
    expectedSelectedAssets: expectedHashes.size,
    r2ObjectsChecked: options.skipR2HeadVerification
      ? 0
      : r2Results.length,
    r2HeadVerificationSkipped:
      options.skipR2HeadVerification === true,
    r2ObjectsVerified: verifiedHashes.size,
    r2ObjectsInvalid: r2Results.length - verifiedHashes.size,
    r2InventoryObjects: inventoryObjects.length,
    expectedR2InventoryKeys: expectedStorageKeys.size,
    missingR2InventoryKeys: missingInventoryKeys.length,
    unusedOptimizationPlanAssets: unusedPlanKeys.size,
    uploadedUnusedOptimizationPlanAssets: uploadedUnusedPlanKeys.length,
    expectedUniqueVariants: expectedVariantIds.size,
    uniqueVariants: expectedVariantIds.size - missingVariants.length,
    expectedPlacements: expectedPlacementKeys.size,
    placements: expectedPlacementKeys.size - missingPlacements.length,
    expectedCoursePapers: expectedCoursePaperKeys.size,
    coursePapers: expectedCoursePaperKeys.size - missingCoursePapers.length,
    expectedVariantPapers: expectedVariantPaperKeys.size,
    variantPapers: expectedVariantPaperKeys.size - missingVariantPapers.length,
    expectedPapers: expectedPaperIds.size,
    papers: expectedPaperIds.size - missingPapers.length,
    expectedAssetRows: expectedAssetIds.size,
    assetRows: expectedAssetIds.size - missingAssetRows.length,
    expectedAssetSources: expectedAssetSourceIds.size,
    assetSources: expectedAssetSourceIds.size - missingAssetSources.length,
    expectedVariantAssets: expectedVariantAssetKeys.size,
    variantAssets: expectedVariantAssetKeys.size - missingVariantAssets.length,
    expectedSearchDocuments: expectedVariantIds.size,
    searchDocuments: expectedVariantIds.size - missingSearchDocuments.length,
    duplicateSearchVariantIds:
      searchDocuments.length - searchVariantIds.size,
    unexpectedExamMateQuestionSourceRows:
      unexpectedQuestionSourceRows.length,
    unexpectedExamMateVariantSourceRows:
      unexpectedVariantSourceRows.length,
    unexpectedExamMateSearchDocuments:
      unexpectedSearchDocuments.length,
    mismatchedQuestionSourceRelationships:
      mismatchedQuestionSources.length,
    mismatchedVariantSourceRelationships:
      mismatchedVariantSources.length,
    mismatchedVariantRelationships: mismatchedVariants.length,
    mismatchedQuestionCoreContent:
      mismatchedQuestionCores.length,
    mismatchedVariantDetails:
      mismatchedVariantDetails.length,
    nonReadyVariants: nonReadyVariants.length,
    unexpectedExpectedPlacements:
      unexpectedExpectedPlacements.length,
    unexpectedExpectedVariantPapers:
      unexpectedExpectedVariantPapers.length,
    mismatchedAssetSourceRelationships:
      mismatchedAssetSources.length,
    mismatchedVariantAssetRelationships:
      mismatchedVariantAssets.length,
    unexpectedExpectedVariantAssets:
      unexpectedExpectedVariantAssets.length,
    unexpectedBatchQuestions: unexpectedQuestions.length,
    unexpectedBatchVariants: unexpectedVariants.length,
    unexpectedBatchPapers: unexpectedPapers.length,
    unexpectedBatchCoursePapers: unexpectedCoursePapers.length,
    unexpectedBatchPlacements: unexpectedPlacements.length,
    unexpectedBatchVariantPapers:
      unexpectedVariantPapers.length,
    unexpectedBatchAssets: unexpectedAssetRows.length,
    unexpectedBatchAssetSources: unexpectedAssetSources.length,
    unexpectedBatchVariantAssets:
      unexpectedVariantAssets.length,
    criticalImportFindings: criticalImportFindings.length,
    missingR2InventoryKeyHashes: missingInventoryKeys
      .slice(0, 20)
      .map((key) => crypto.createHash('sha256').update(key).digest('hex')),
    uploadedUnusedOptimizationKeyHashes: uploadedUnusedPlanKeys
      .slice(0, 20)
      .map((key) => crypto.createHash('sha256').update(key).digest('hex')),
    invalidR2Objects: r2Results
      .filter((row) => !row.verified)
      .slice(0, 20)
      .map((row) => ({
        assetIdHash: crypto
          .createHash('sha256')
          .update(row.asset.id)
          .digest('hex'),
        contentHash: row.asset.content_hash,
        storageKeyHash: crypto
          .createHash('sha256')
          .update(row.asset.storage_key)
          .digest('hex'),
        status: row.status,
        error: row.error || null,
      })),
    missingQuestionSourceHashes: missingQuestionSources
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    missingVariantSourceHashes: missingVariantSources
      .slice(0, 20)
      .map((key) =>
        crypto.createHash('sha256').update(key).digest('hex'),
      ),
    missingAssets: missingAssets.slice(0, 20),
    missingQuestionSourceRowHashes: missingQuestionSourceRows
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    missingVariantSourceRowHashes: missingVariantSourceRows
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    missingVariantHashes: missingVariants
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    missingPlacements: missingPlacements
      .slice(0, 20)
      .map((key) => crypto.createHash('sha256').update(key).digest('hex')),
    missingCoursePapers: missingCoursePapers
      .slice(0, 20)
      .map((key) => crypto.createHash('sha256').update(key).digest('hex')),
    missingVariantPapers: missingVariantPapers
      .slice(0, 20)
      .map((key) => crypto.createHash('sha256').update(key).digest('hex')),
    missingPaperHashes: missingPapers
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    missingAssetRowHashes: missingAssetRows
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    missingAssetSourceHashes: missingAssetSources
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    missingVariantAssets: missingVariantAssets
      .slice(0, 20)
      .map((key) => crypto.createHash('sha256').update(key).digest('hex')),
    missingSearchDocumentHashes: missingSearchDocuments
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    mismatchedQuestionCoreHashes: mismatchedQuestionCores
      .slice(0, 20)
      .map(([id]) => crypto.createHash('sha256').update(id).digest('hex')),
    mismatchedVariantDetailHashes: mismatchedVariantDetails
      .slice(0, 20)
      .map(([id]) => crypto.createHash('sha256').update(id).digest('hex')),
    nonReadyVariantHashes: nonReadyVariants
      .slice(0, 20)
      .map((id) => crypto.createHash('sha256').update(id).digest('hex')),
    mismatchedVariantAssetHashes: mismatchedVariantAssets
      .slice(0, 20)
      .map(([key]) =>
        crypto.createHash('sha256').update(key).digest('hex'),
      ),
    batches,
  };
}

async function finalizeBatch(client, batchId, report, status) {
  if (!batchId) return;
  const { error } = await client
    .from('dp_qb_import_batches')
    .update({
      status: status === 'passed' ? 'completed' : 'failed',
      verification_status: status,
      final_report: report,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  if (error) throw new Error(`Unable to finalize import batch: ${error.message}`);
}

function defaultReportPath(options) {
  if (options.report) return path.resolve(options.report);
  return path.resolve(
    '.question-bank-reports',
    `exam-mate-optimized-${options.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
}

async function saveReport(filePath, report) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.archive) throw new Error('--archive is required.');
  if (!options.optimizationAudit) throw new Error('--optimization-audit is required.');

  const reportPath = defaultReportPath(options);
  const sourceArchive = await resolveExamMateArchive(options.archive, {
    assetRoot: options.assetsRoot,
  });
  const optimizationArchive = await resolveExamMateOptimizationAudit(
    options.optimizationAudit,
  );
  let batchId = null;
  try {
    const [source, optimizationAudit] = await Promise.all([
      normalizeExamMateArchive(sourceArchive.root, {
        assetRoot: sourceArchive.assetRoot,
        requireLocalAssets: false,
        verifyLocalAssets: false,
      }),
      loadExamMateOptimizationAudit(optimizationArchive.root),
    ]);
    const requiresSelectedFiles = options.mode === 'assets' || options.mode === 'all';
    const optimizedSource = await applyExamMateOptimizationPlan(
      source,
      optimizationAudit,
      {
        assetRoot: options.assetsRoot || sourceArchive.assetRoot,
        requireLocalAssets: requiresSelectedFiles,
        verifyLocalAssets: requiresSelectedFiles,
      },
    );

    let normalized = optimizedSource;
    let client = null;
    if (options.mode !== 'audit') {
      client = createImportClient();
      normalized = await resolveExamMateForProduction(optimizedSource, client, {
        storageProvider: 'r2',
        storageBucket: resolveQuestionBankBucket(options),
        recoveryBatchId: options.resumeBatchId,
      });
    }

    const report = {
      ...publicExamMateReport(normalized),
      optimizationSummary: optimizationAudit.summary,
      requestedMode: options.mode,
      productionWritePerformed: false,
      databaseImport: null,
      assetUpload: null,
      productionVerification: null,
    };

    if (normalized.verificationStatus !== 'passed') {
      await saveReport(reportPath, report);
      process.stdout.write(`${JSON.stringify({ ...report, reportPath }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }

    if (options.mode === 'assets' || options.mode === 'all') {
      const verifiedBucket = await preflightPrivateR2Bucket(options);
      process.stdout.write(
        `Authenticated private R2 bucket preflight passed for ${verifiedBucket}.\n`,
      );
    }

    if (
      options.mode === 'database' ||
      options.mode === 'database-verify' ||
      options.mode === 'all'
    ) {
      const result = await importDatabase(normalized, { ...options, client });
      batchId = result.batchId;
      report.databaseImport = result;
      report.productionWritePerformed = true;
    }

    if (options.mode === 'assets' || options.mode === 'all') {
      try {
        report.assetUpload = await uploadAssets(normalized, {
          ...options,
          client,
          storageBucket: resolveQuestionBankBucket(options),
        });
        report.productionWritePerformed = true;
        if (report.assetUpload.failed) process.exitCode = 1;
      } catch (error) {
        if (batchId) {
          await finalizeBatch(
            client,
            batchId,
            {
              stage: 'assets',
              sourceArchiveSha256: normalized.sourceArchiveSha256,
              optimizationAuditSha256: normalized.optimizationAuditSha256,
              error: String(error.message || error).slice(0, 1000),
            },
            'failed',
          );
        }
        throw error;
      }
    }

    if (
      options.mode === 'verify' ||
      options.mode === 'database-verify' ||
      options.mode === 'all'
    ) {
      try {
        report.productionVerification = await verifyProduction(normalized, {
          ...options,
          client,
        });
        if (report.productionVerification.status !== 'passed') {
          process.exitCode = 1;
        }
      } catch (error) {
        if (batchId) {
          await finalizeBatch(
            client,
            batchId,
            {
              stage: 'verification',
              sourceArchiveSha256: normalized.sourceArchiveSha256,
              optimizationAuditSha256: normalized.optimizationAuditSha256,
              error: String(error.message || error).slice(0, 1000),
            },
            'failed',
          );
        }
        throw error;
      }
    }

    const finalStatus =
      process.exitCode || report.assetUpload?.failed
        ? 'failed'
        : report.productionVerification?.status || 'passed';
    if (batchId) {
      await finalizeBatch(
        client,
        batchId,
        {
          sourceArchiveSha256: normalized.sourceArchiveSha256,
          optimizationAuditSha256: normalized.optimizationAuditSha256,
          combinedArchiveSha256: normalized.archiveSha256,
          actualCounts: normalized.actualCounts,
          assetUpload: report.assetUpload
            ? {
                provider: report.assetUpload.provider,
                bucket: report.assetUpload.bucket,
                counts: report.assetUpload.counts,
                inventory: report.assetUpload.inventory,
                failed: report.assetUpload.failed,
              }
            : null,
          productionVerification: report.productionVerification,
        },
        finalStatus,
      );
    }

    await saveReport(reportPath, report);
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: options.mode,
          sourceArchiveSha256: normalized.sourceArchiveSha256,
          optimizationAuditSha256: normalized.optimizationAuditSha256,
          combinedArchiveSha256: normalized.archiveSha256,
          verificationStatus: normalized.verificationStatus,
          actualCounts: normalized.actualCounts,
          databaseImport: report.databaseImport,
          assetUpload: report.assetUpload
            ? {
                provider: report.assetUpload.provider,
                bucket: report.assetUpload.bucket,
                counts: report.assetUpload.counts,
                inventory: report.assetUpload.inventory,
                failed: report.assetUpload.failed,
              }
            : null,
          productionVerification: report.productionVerification,
          reportPath,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await Promise.all([sourceArchive.cleanup(), optimizationArchive.cleanup()]);
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

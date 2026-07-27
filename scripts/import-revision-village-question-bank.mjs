#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import {
  getPrivateR2Object,
  putPrivateR2Object,
} from './r2-s3.mjs';
import { deterministicUuid } from './question-bank/archive.mjs';
import {
  normalizeRevisionVillageArchive,
  publicRevisionVillageReport,
  resolveRevisionVillageArchive,
  resolveRevisionVillageForProduction,
} from './question-bank/revision-village.mjs';

const WRITE_MODES = new Set(['database', 'assets', 'all']);
const MODES = new Set(['audit', 'dry-run', 'database', 'assets', 'all', 'verify']);

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
  ['dp_qb_audio_assets', 'audioAssets', 'asset_id'],
  ['dp_qb_paper_assets', 'paperAssets', 'paper_id,asset_id,role'],
  ['dp_qb_solution_videos', 'videos', 'id'],
  [
    'dp_qb_variant_solution_videos',
    'variantVideos',
    'variant_id,video_id,part_name',
  ],
  ['dp_qb_question_search', 'searchDocuments', 'variant_id'],
];

const NO_BATCH_COLUMNS = new Set([
  'dp_qb_course_papers',
  'dp_qb_question_search',
]);

function usage() {
  return `
DP Resources audited Revision Village question-bank importer

Usage:
  node scripts/import-revision-village-question-bank.mjs --archive <zip-or-directory> --mode <mode> [options]

Modes:
  audit       Verify the exact authorized archive and checksums only.
  dry-run     Normalize, compare with production and report intended operations.
  database    Append missing Supabase rows (requires --confirm-production).
  assets      Upload and verify missing private R2 objects (requires --confirm-production).
  all         Append rows, upload assets and run complete verification.
  verify      Read-only verification against production.

Options:
  --workers <n>             R2 upload concurrency (default: 8).
  --batch-size <n>          Supabase upsert batch size (default: 250).
  --storage-provider <p>    Must be r2 for this production import.
  --storage-bucket <name>   Private R2 bucket; defaults to configured question-bank/PDF bucket.
  --report <path>           JSON report output path.
  --confirm-production      Required for database/R2 writes.
  --help                    Show this help.
`;
}

function parseArguments(argv) {
  const options = {
    archive: null,
    mode: 'audit',
    workers: 8,
    batchSize: 250,
    storageProvider: 'r2',
    storageBucket: null,
    report: null,
    confirmProduction: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--archive') options.archive = argv[++index];
    else if (token === '--mode') options.mode = argv[++index];
    else if (token === '--workers') options.workers = Number(argv[++index]);
    else if (token === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (token === '--storage-provider') options.storageProvider = argv[++index];
    else if (token === '--storage-bucket') options.storageBucket = argv[++index];
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
  if (options.storageProvider !== 'r2') {
    throw new Error('Revision Village production assets must use private Cloudflare R2.');
  }
  return options;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for this operation.`);
  return value;
}

function createImportClient() {
  return createClient(
    requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { 'X-Client-Info': 'dp-resources-revision-village-importer' },
      },
    },
  );
}

function storageBucket(options) {
  return (
    options.storageBucket ||
    process.env.R2_QUESTION_BANK_BUCKET?.trim() ||
    process.env.R2_PDF_PREVIEW_BUCKET?.trim() ||
    'dp-pdf-previews'
  );
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function databaseRow(row, batchId, table) {
  const output = { ...row };
  delete output.local_path;
  if (!NO_BATCH_COLUMNS.has(table)) {
    output.created_by_batch_id = batchId;
    output.last_seen_batch_id = batchId;
  }
  return output;
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
  let processed = 0;
  for (const group of chunks(rows, batchSize)) {
    const payload = group.map((row) => databaseRow(row, batchId, table));
    const { error } = await retry(() =>
      client.from(table).upsert(payload, {
        onConflict: conflict,
        ignoreDuplicates: !updateExisting,
      }),
    );
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    processed += group.length;
  }
  return processed;
}

async function createOrResumeBatch(client, normalized, mode) {
  const payload = {
    archive_identifier: normalized.archiveIdentifier,
    archive_sha256: normalized.archiveSha256,
    importer_version: normalized.importerVersion,
    mode: mode === 'dry-run' ? 'dry_run' : mode,
    status: 'importing',
    expected_counts: normalized.expectedCounts,
    actual_counts: normalized.actualCounts,
    operation_counts: {},
    final_report: {},
    verification_status: normalized.verificationStatus,
    completed_at: null,
  };
  const { data, error } = await client
    .from('dp_qb_import_batches')
    .upsert(payload, {
      onConflict: 'archive_sha256,importer_version,mode',
    })
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

async function importDatabase(normalized, options) {
  if (normalized.verificationStatus !== 'passed') {
    throw new Error('Database import refused because normalization failed.');
  }
  const client = options.client;
  const batchId = await createOrResumeBatch(client, normalized, options.mode);
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
        table === 'dp_qb_question_search',
      );
      process.stdout.write(`${table}: ${operationCounts[table]} row(s) processed\n`);
    }
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
          archiveSha256: normalized.archiveSha256,
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

async function uploadOneAsset(asset) {
  if (asset.verification_status === 'verified') {
    return { status: 'skipped_verified', asset };
  }
  const existing = await getPrivateR2Object({
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    signal: AbortSignal.timeout(45_000),
  });
  if (existing.status !== 404 && (await verifyR2Body(asset, existing))) {
    return { status: 'verified_existing_object', asset };
  }

  const body = await readFile(asset.local_path);
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  if (digest !== asset.content_hash || body.byteLength !== Number(asset.byte_size)) {
    throw new Error(`Local asset verification failed for ${asset.content_hash}.`);
  }
  await putPrivateR2Object({
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    body,
    contentType: asset.content_type,
    cacheControl: 'private, max-age=31536000, immutable',
    signal: AbortSignal.timeout(60_000),
  });
  const stored = await getPrivateR2Object({
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    signal: AbortSignal.timeout(60_000),
  });
  if (!(await verifyR2Body(asset, stored))) {
    throw new Error(`R2 SHA-256/size verification failed for ${asset.storage_key}.`);
  }
  return { status: 'uploaded_verified', asset };
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
        const failed = results.filter((result) => result?.status === 'failed').length;
        process.stdout.write(`R2 assets ${completed}/${candidates.length}; failures ${failed}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: options.workers }, worker));
  await updateAssetStates(options.client, results, options.batchSize);
  const counts = results.reduce(
    (result, item) => {
      result[item.status] = (result[item.status] || 0) + 1;
      return result;
    },
    {},
  );
  const failures = results
    .filter((result) => result.status === 'failed')
    .map((result) => ({
      id: result.asset.id,
      key: result.asset.storage_key,
      error: result.error,
    }));
  return {
    provider: 'r2',
    bucket: storageBucket(options),
    counts,
    failures,
    failed: failures.length,
  };
}

async function verifyProduction(normalized, options) {
  const client = options.client;
  const sourceQuestionIds = normalized.source.questions.map((row) => row.id);
  const sourceVariantKeys = normalized.source.logicalVariants.map(
    (row) => `${row.sourceQuestionId}:${row.sourceCourse}:${row.topicSlug}`,
  );
  const expectedHashes = new Set(
    [...normalized.source.physicalByHash.keys()].map((value) => String(value)),
  );

  const [questionSources, variantSources, assets, audio, videos, batches] =
    await Promise.all([
      fetchPaged(
        client,
        'dp_qb_question_sources',
        'source_question_id,question_id',
        (query) => query.eq('provider', 'revision_village'),
      ),
      fetchPaged(
        client,
        'dp_qb_variant_sources',
        'source_question_id,source_course,source_topic,variant_id',
        (query) => query.eq('provider', 'revision_village'),
      ),
      fetchPaged(
        client,
        'dp_qb_assets',
        'id,content_hash,verification_status,storage_provider,storage_bucket,storage_key',
      ),
      fetchPaged(
        client,
        'dp_qb_audio_assets',
        'asset_id,provider,source_audio_id',
        (query) => query.eq('provider', 'revision_village'),
      ),
      fetchPaged(
        client,
        'dp_qb_solution_videos',
        'id,provider,provider_video_id',
        (query) => query.eq('provider', 'revision_village'),
      ),
      fetchPaged(
        client,
        'dp_qb_import_batches',
        'id,archive_sha256,importer_version,mode,status,verification_status,operation_counts,actual_counts',
        (query) =>
          query
            .eq('archive_sha256', normalized.archiveSha256)
            .eq('importer_version', normalized.importerVersion),
      ),
    ]);

  const sourceQuestionSet = new Set(questionSources.map((row) => row.source_question_id));
  const sourceVariantSet = new Set(
    variantSources.map(
      (row) => `${row.source_question_id}:${row.source_course}:${row.source_topic}`,
    ),
  );
  const verifiedHashes = new Set(
    assets
      .filter(
        (row) =>
          row.verification_status === 'verified' && row.storage_provider === 'r2',
      )
      .map((row) => row.content_hash),
  );

  const missingQuestionSources = sourceQuestionIds.filter(
    (id) => !sourceQuestionSet.has(id),
  );
  const missingVariantSources = sourceVariantKeys.filter(
    (key) => !sourceVariantSet.has(key),
  );
  const missingAssets = [...expectedHashes].filter((hash) => !verifiedHashes.has(hash));
  const expectedAudioIds = new Set(
    normalized.source.audioManifest.map((row) => String(row.audioId)),
  );
  const importedAudioIds = new Set(
    audio.map((row) => String(row.source_audio_id)),
  );
  const missingAudioIds = [...expectedAudioIds].filter(
    (id) => !importedAudioIds.has(id),
  );
  const expectedVideoIds = new Set(
    normalized.source.solutionVideos.map((row) => String(row.videoId)),
  );
  const importedVideoIds = new Set(
    videos.map((row) => String(row.provider_video_id)),
  );
  const missingVideoIds = [...expectedVideoIds].filter(
    (id) => !importedVideoIds.has(id),
  );
  const passed =
    missingQuestionSources.length === 0 &&
    missingVariantSources.length === 0 &&
    missingAssets.length === 0 &&
    missingAudioIds.length === 0 &&
    missingVideoIds.length === 0;

  return {
    status: passed ? 'passed' : 'failed',
    questionSources: questionSources.length,
    expectedQuestionSources: sourceQuestionIds.length,
    variantSources: variantSources.length,
    expectedVariantSources: sourceVariantKeys.length,
    verifiedSourceAssets: expectedHashes.size - missingAssets.length,
    expectedSourceAssets: expectedHashes.size,
    audioAssets: expectedAudioIds.size - missingAudioIds.length,
    expectedAudioAssets: expectedAudioIds.size,
    solutionVideos: expectedVideoIds.size - missingVideoIds.length,
    expectedSolutionVideos: expectedVideoIds.size,
    missingQuestionSources: missingQuestionSources.slice(0, 20),
    missingVariantSources: missingVariantSources.slice(0, 20),
    missingAssets: missingAssets.slice(0, 20),
    missingAudioIds: missingAudioIds.slice(0, 20),
    missingVideoIds: missingVideoIds.slice(0, 20),
    batches,
  };
}

async function fetchPaged(client, table, columns, applyFilters = (query) => query) {
  const output = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = client
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    query = applyFilters(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table} verification read failed: ${error.message}`);
    output.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return output;
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
    `revision-village-${options.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
  const reportPath = defaultReportPath(options);
  const archive = await resolveRevisionVillageArchive(options.archive);
  let batchId = null;
  try {
    const source = await normalizeRevisionVillageArchive(archive.root);
    let normalized = source;
    let client = null;
    if (options.mode !== 'audit') {
      client = createImportClient();
      normalized = await resolveRevisionVillageForProduction(source, client, {
        storageProvider: 'r2',
        storageBucket: storageBucket(options),
      });
    }
    const report = {
      ...publicRevisionVillageReport(normalized),
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

    if (options.mode === 'database' || options.mode === 'all') {
      const result = await importDatabase(normalized, {
        ...options,
        client,
      });
      batchId = result.batchId;
      report.databaseImport = result;
      report.productionWritePerformed = true;
    }

    if (options.mode === 'assets' || options.mode === 'all') {
      report.assetUpload = await uploadAssets(normalized, {
        ...options,
        client,
        storageBucket: storageBucket(options),
      });
      report.productionWritePerformed = true;
      if (report.assetUpload.failed) process.exitCode = 1;
    }

    if (options.mode === 'verify' || options.mode === 'all') {
      report.productionVerification = await verifyProduction(normalized, {
        ...options,
        client,
      });
      if (report.productionVerification.status !== 'passed') process.exitCode = 1;
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
          archiveSha256: normalized.archiveSha256,
          actualCounts: normalized.actualCounts,
          assetUpload: report.assetUpload
            ? {
                provider: report.assetUpload.provider,
                bucket: report.assetUpload.bucket,
                counts: report.assetUpload.counts,
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
          archiveSha256: normalized.archiveSha256,
          verificationStatus: normalized.verificationStatus,
          actualCounts: normalized.actualCounts,
          databaseImport: report.databaseImport,
          assetUpload: report.assetUpload
            ? {
                provider: report.assetUpload.provider,
                bucket: report.assetUpload.bucket,
                counts: report.assetUpload.counts,
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
    await archive.cleanup();
  }
}

main().catch((error) => {
  process.stderr.write(
    `Revision Village importer failed: ${error.message || error}\n`,
  );
  process.exitCode = 1;
});

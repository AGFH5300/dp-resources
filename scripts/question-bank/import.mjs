import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

import { deterministicUuid } from './archive.mjs';
import {
  getPrivateR2Object,
  putPrivateR2Object,
} from '../r2-s3.mjs';

const TABLES = [
  ['dp_qb_subjects', 'subjects', 'id'],
  ['dp_qb_courses', 'courses', 'id'],
  ['dp_qb_datasets', 'datasets', 'id'],
  ['dp_qb_topics', 'topics', 'id'],
  ['dp_qb_subtopics', 'subtopics', 'id'],
  ['dp_qb_papers', 'papers', 'id'],
  ['dp_qb_course_papers', 'coursePapers', 'course_id,paper_id'],
  ['dp_qb_questions', 'questions', 'id'],
  ['dp_qb_question_variants', 'variants', 'id'],
  [
    'dp_qb_question_subtopics',
    'placements',
    'variant_id,subtopic_id',
  ],
  ['dp_qb_assets', 'assets', 'id'],
  ['dp_qb_asset_sources', 'assetSources', 'id'],
  ['dp_qb_variant_assets', 'variantAssets', 'variant_id,asset_id,role'],
  ['dp_qb_solution_videos', 'videos', 'id'],
  [
    'dp_qb_variant_solution_videos',
    'variantVideos',
    'variant_id,video_id,part_name',
  ],
  ['dp_qb_question_search', 'searchDocuments', 'variant_id'],
];

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for this operation.`);
  return value;
}

export function createImportClient() {
  const url = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'dp-resources-question-bank-importer' } },
  });
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

function databaseRow(row, batchId, table) {
  const output = { ...row };
  delete output.local_path;
  delete output.filePath;
  if ('created_by_batch_id' in row || !['dp_qb_course_papers', 'dp_qb_question_search'].includes(table)) {
    output.created_by_batch_id = batchId;
  }
  if (!['dp_qb_course_papers', 'dp_qb_question_search'].includes(table)) {
    output.last_seen_batch_id = batchId;
  }
  return output;
}

async function upsertRows(
  client,
  table,
  rows,
  conflict,
  batchSize,
  batchId,
  preserveExisting,
) {
  let processed = 0;
  for (const group of chunks(rows, batchSize)) {
    const payload = group.map((row) => databaseRow(row, batchId, table));
    const { error } = await client
      .from(table)
      .upsert(payload, {
        onConflict: conflict,
        ignoreDuplicates: preserveExisting,
      });
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
    mode,
    status: 'importing',
    expected_counts: normalized.expectedCounts,
    actual_counts: normalized.actualCounts,
    verification_status: normalized.verificationStatus,
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
  const rows = normalized.findings.map((item) => ({
    ...item,
    id: deterministicUuid(`batch-finding:${batchId}:${item.id}`),
    batch_id: batchId,
  }));
  for (const group of chunks(rows, batchSize)) {
    const { error } = await client
      .from('dp_qb_import_findings')
      .upsert(group, { onConflict: 'id' });
    if (error) throw new Error(`Import findings upsert failed: ${error.message}`);
  }
  return rows.length;
}

export async function importDatabase(normalized, options = {}) {
  if (normalized.verificationStatus !== 'passed')
    throw new Error('Database import refused because archive verification failed.');
  const client = options.client || createImportClient();
  const batchSize = Math.max(25, Math.min(Number(options.batchSize || 250), 500));
  const batchId = await createOrResumeBatch(
    client,
    normalized,
    options.mode || 'database',
  );
  const operationCounts = {};

  try {
    for (const [table, rowKey, conflict] of TABLES) {
      const rows = normalized.rows[rowKey];
      operationCounts[table] = await upsertRows(
        client,
        table,
        rows,
        conflict,
        batchSize,
        batchId,
        options.preserveExisting === true,
      );
    }
    operationCounts.dp_qb_import_findings = await storeFindings(
      client,
      normalized,
      batchId,
      batchSize,
    );
    const { error } = await client
      .from('dp_qb_import_batches')
      .update({
        status: 'completed',
        operation_counts: operationCounts,
        final_report: {
          archiveSha256: normalized.archiveSha256,
          actualCounts: normalized.actualCounts,
        },
        verification_status: 'passed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    if (error) throw new Error(`Unable to finalize import batch: ${error.message}`);
    return { batchId, operationCounts };
  } catch (error) {
    await client
      .from('dp_qb_import_batches')
      .update({
        status: 'failed',
        final_report: { error: String(error.message || error).slice(0, 1000) },
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    throw error;
  }
}

function storageConfiguration(options = {}) {
  const provider = (
    options.storageProvider ||
    process.env.QUESTION_BANK_STORAGE_PROVIDER ||
    'r2'
  ).toLowerCase();
  if (!['r2', 'supabase'].includes(provider))
    throw new Error('QUESTION_BANK_STORAGE_PROVIDER must be r2 or supabase.');
  const bucket =
    options.storageBucket ||
    (provider === 'r2'
      ? process.env.R2_QUESTION_BANK_BUCKET
      : process.env.QUESTION_BANK_SUPABASE_BUCKET);
  if (!bucket)
    throw new Error(
      provider === 'r2'
        ? 'R2_QUESTION_BANK_BUCKET is required for asset upload.'
        : 'QUESTION_BANK_SUPABASE_BUCKET is required for asset upload.',
    );
  return { provider, bucket };
}

async function retry(operation, attempts = 3) {
  let latest;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      latest = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
  }
  throw latest;
}

async function uploadR2(asset, configuration) {
  const body = await readFile(asset.local_path);
  await putPrivateR2Object({
    bucket: configuration.bucket,
    key: asset.storage_key,
    body,
    contentType: asset.content_type,
    cacheControl: 'private, max-age=31536000, immutable',
    signal: AbortSignal.timeout(30_000),
  });
  const stored = await getPrivateR2Object({
    bucket: configuration.bucket,
    key: asset.storage_key,
    signal: AbortSignal.timeout(30_000),
  });
  if (!stored.ok)
    throw new Error(`R2 verification returned status ${stored.status}`);
  const verifiedBytes = Buffer.from(await stored.arrayBuffer());
  if (verifiedBytes.byteLength !== asset.byte_size)
    throw new Error(
      `R2 verification size mismatch: expected ${asset.byte_size}, received ${verifiedBytes.byteLength}`,
    );
  const verifiedHash = createHash('sha256').update(verifiedBytes).digest('hex');
  if (verifiedHash !== asset.content_hash)
    throw new Error('R2 verification SHA-256 mismatch.');
}

async function uploadSupabase(client, asset, configuration) {
  const body = await readFile(asset.local_path);
  const { error } = await client.storage
    .from(configuration.bucket)
    .upload(asset.storage_key, body, {
      contentType: asset.content_type,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  const directory = asset.storage_key.split('/').slice(0, -1).join('/');
  const filename = asset.storage_key.split('/').at(-1);
  const { data, error: listError } = await client.storage
    .from(configuration.bucket)
    .list(directory, { search: filename, limit: 10 });
  if (listError) throw listError;
  const uploaded = data?.find((item) => item.name === filename);
  if (!uploaded) throw new Error('Supabase Storage verification could not find object.');
  const size = Number(uploaded.metadata?.size);
  if (Number.isFinite(size) && size !== asset.byte_size)
    throw new Error(
      `Supabase Storage size mismatch: expected ${asset.byte_size}, received ${size}`,
    );
}

async function verifiedAssetIds(client, ids) {
  const targetIds = new Set(ids);
  const verified = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await retry(
      () =>
        client
          .from('dp_qb_assets')
          .select('id,verification_status')
          .order('id')
          .range(offset, offset + pageSize - 1),
      4,
    );
    if (error) throw new Error(`Unable to read asset resume state: ${error.message}`);
    for (const row of data || [])
      if (targetIds.has(row.id) && row.verification_status === 'verified')
        verified.add(row.id);
    if (!data || data.length < pageSize) break;
  }
  return verified;
}

export async function uploadAssets(normalized, options = {}) {
  if (normalized.verificationStatus !== 'passed')
    throw new Error('Asset upload refused because archive verification failed.');
  const client = options.client || createImportClient();
  const configuration = storageConfiguration(options);
  const assets = normalized.rows.assets.map((asset) => ({
    ...asset,
    storage_provider: configuration.provider,
    storage_bucket: configuration.bucket,
  }));
  const verified = await verifiedAssetIds(
    client,
    assets.map((asset) => asset.id),
  );
  const pending = assets.filter((asset) => !verified.has(asset.id));
  const workers = Math.max(1, Math.min(Number(options.workers || 4), 12));
  const failures = [];
  let uploaded = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      const asset = pending[cursor++];
      try {
        await retry(() =>
          configuration.provider === 'r2'
            ? uploadR2(asset, configuration)
            : uploadSupabase(client, asset, configuration),
        );
        await retry(async () => {
          const { error } = await client
            .from('dp_qb_assets')
            .update({
              storage_provider: configuration.provider,
              storage_bucket: configuration.bucket,
              upload_status: 'uploaded',
              verification_status: 'verified',
              uploaded_at: new Date().toISOString(),
              verified_at: new Date().toISOString(),
              last_error: null,
            })
            .eq('id', asset.id);
          if (error) throw error;
        }, 4);
        uploaded += 1;
      } catch (error) {
        const message = String(error.message || error).slice(0, 1000);
        failures.push({ id: asset.id, key: asset.storage_key, error: message });
        await client
          .from('dp_qb_assets')
          .update({
            upload_status: 'failed',
            verification_status: 'failed',
            last_error: message,
          })
          .eq('id', asset.id);
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  return {
    provider: configuration.provider,
    bucket: configuration.bucket,
    skippedVerified: verified.size,
    uploaded,
    failed: failures.length,
    failures,
  };
}

const VERIFY_TABLES = {
  subjects: 'dp_qb_subjects',
  courses: 'dp_qb_courses',
  datasets: 'dp_qb_datasets',
  topics: 'dp_qb_topics',
  subtopics: 'dp_qb_subtopics',
  questionCores: 'dp_qb_questions',
  variants: 'dp_qb_question_variants',
  storedPlacementRows: 'dp_qb_question_subtopics',
  contentDeduplicatedAssets: 'dp_qb_assets',
  vimeoUrls: 'dp_qb_solution_videos',
};

export async function verifyDatabase(normalized, options = {}) {
  const client = options.client || createImportClient();
  const counts = {};
  for (const [key, table] of Object.entries(VERIFY_TABLES)) {
    const { count, error } = await client
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(`${table} verification failed: ${error.message}`);
    counts[key] = count || 0;
  }
  const mismatches = Object.entries(counts)
    .filter(([key, value]) => normalized.actualCounts[key] !== value)
    .map(([key, actual]) => ({
      key,
      expected: normalized.actualCounts[key],
      actual,
    }));
  const { count: failedAssets, error: assetError } = await client
    .from('dp_qb_assets')
    .select('*', { count: 'exact', head: true })
    .neq('verification_status', 'verified');
  if (assetError) throw new Error(`Asset verification query failed: ${assetError.message}`);
  return {
    status: mismatches.length || (failedAssets || 0) > 0 ? 'failed' : 'passed',
    counts,
    mismatches,
    failedOrPendingAssets: failedAssets || 0,
  };
}

async function existingKeysByIn(
  client,
  table,
  filterField,
  filterValues,
  select,
  keyForRow,
  groupSize = 200,
) {
  const found = new Set();
  for (const group of chunks([...new Set(filterValues)], groupSize)) {
    if (!group.length) continue;
    const { data, error } = await client.from(table).select(select).in(filterField, group);
    if (error) throw new Error(`${table} scoped verification failed: ${error.message}`);
    for (const row of data || []) found.add(keyForRow(row));
  }
  return found;
}

export async function verifyImportRows(normalized, options = {}) {
  const client = options.client || createImportClient();
  const checks = [
    ['dp_qb_subjects', 'subjects', 'id', 'id'],
    ['dp_qb_courses', 'courses', 'id', 'id'],
    ['dp_qb_datasets', 'datasets', 'id', 'id'],
    ['dp_qb_topics', 'topics', 'id', 'id'],
    ['dp_qb_subtopics', 'subtopics', 'id', 'id'],
    ['dp_qb_papers', 'papers', 'id', 'id'],
    ['dp_qb_questions', 'questions', 'id', 'id'],
    ['dp_qb_question_variants', 'variants', 'id', 'id'],
    ['dp_qb_asset_sources', 'assetSources', 'id', 'id'],
    ['dp_qb_question_search', 'searchDocuments', 'variant_id', 'variant_id'],
  ];
  const results = {};

  for (const [table, rowKey, filterField, select] of checks) {
    const expected = new Set(normalized.rows[rowKey].map((row) => row[filterField]));
    const found = await existingKeysByIn(
      client,
      table,
      filterField,
      expected,
      select,
      (row) => row[filterField],
    );
    results[table] = {
      expected: expected.size,
      found: found.size,
      missing: [...expected].filter((key) => !found.has(key)).slice(0, 20),
    };
  }

  const compositeChecks = [
    {
      table: 'dp_qb_course_papers',
      rowKey: 'coursePapers',
      filterField: 'course_id',
      select: 'course_id,paper_id',
      key: (row) => `${row.course_id}:${row.paper_id}`,
    },
    {
      table: 'dp_qb_question_subtopics',
      rowKey: 'placements',
      filterField: 'variant_id',
      select: 'variant_id,subtopic_id',
      key: (row) => `${row.variant_id}:${row.subtopic_id}`,
    },
    {
      table: 'dp_qb_variant_assets',
      rowKey: 'variantAssets',
      filterField: 'variant_id',
      select: 'variant_id,asset_id,role',
      key: (row) => `${row.variant_id}:${row.asset_id}:${row.role}`,
      groupSize: 25,
    },
  ];
  for (const check of compositeChecks) {
    const expected = new Set(normalized.rows[check.rowKey].map(check.key));
    const found = await existingKeysByIn(
      client,
      check.table,
      check.filterField,
      normalized.rows[check.rowKey].map((row) => row[check.filterField]),
      check.select,
      check.key,
      check.groupSize,
    );
    results[check.table] = {
      expected: expected.size,
      found: [...found].filter((key) => expected.has(key)).length,
      missing: [...expected].filter((key) => !found.has(key)).slice(0, 20),
    };
  }

  const expectedAssets = new Set(normalized.rows.assets.map((row) => row.id));
  const verifiedAssets = await existingKeysByIn(
    client,
    'dp_qb_assets',
    'id',
    expectedAssets,
    'id,verification_status',
    (row) => (row.verification_status === 'verified' ? row.id : ''),
  );
  verifiedAssets.delete('');
  results.dp_qb_assets = {
    expected: expectedAssets.size,
    found: verifiedAssets.size,
    missing: [...expectedAssets]
      .filter((key) => !verifiedAssets.has(key))
      .slice(0, 20),
  };

  const failed = Object.entries(results)
    .filter(([, value]) => value.expected !== value.found)
    .map(([table, value]) => ({ table, ...value }));
  return {
    status: failed.length ? 'failed' : 'passed',
    checks: results,
    failures: failed,
  };
}

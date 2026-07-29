#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import {
  deletePrivateR2Object,
  getPrivateR2Object,
  putPrivateR2Object,
} from './r2-s3.mjs';

export const OPTIMIZATION_VERSION = 'question-bank-assets-v1';

const MODES = new Set(['dry-run', 'optimize', 'cleanup']);
const RASTER_TYPES = new Set(['image/png', 'image/jpeg']);
const SUPPORTED_TYPES = new Set([...RASTER_TYPES, 'image/svg+xml']);

function usage() {
  return `
DP Resources Question Bank R2 asset optimizer

Usage:
  node scripts/optimize-question-bank-assets.mjs --mode <dry-run|optimize|cleanup> [options]

Modes:
  dry-run   Download, verify and measure possible savings without writing.
  optimize  Upload verified optimized variants and record them in Supabase.
  cleanup   Delete original R2 objects only after optimized delivery is deployed and smoke-tested.

Options:
  --workers <n>               Concurrent optimization workers (default: 4, max: 8).
  --limit <n>                 Process at most n assets; useful for a canary run.
  --min-savings-percent <n>   Minimum percentage reduction to adopt (default: 5).
  --min-savings-bytes <n>     Minimum byte reduction to adopt (default: 1024).
  --report <path>             JSON report output path.
  --force                     Reprocess assets with an existing verified optimization.
  --confirm-production        Required for optimize and cleanup.
  --delete-originals          Additional explicit confirmation required for cleanup.
  --help                      Show this help.

The optimizer never changes dp_qb_assets IDs, source hashes, source paths or
question associations. PNGs are tested as optimized PNG and lossless WebP;
JPEGs are converted to high-quality WebP; SVGs receive conservative structural
minification. Audio, PDFs and icons are intentionally left unchanged.
`;
}

export function parseArguments(argv) {
  const options = {
    mode: 'dry-run',
    workers: 4,
    limit: null,
    minSavingsPercent: 5,
    minSavingsBytes: 1024,
    report: null,
    force: false,
    confirmProduction: false,
    deleteOriginals: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') options.help = true;
    else if (token === '--mode') options.mode = argv[++index];
    else if (token === '--workers') options.workers = Number(argv[++index]);
    else if (token === '--limit') options.limit = Number(argv[++index]);
    else if (token === '--min-savings-percent') {
      options.minSavingsPercent = Number(argv[++index]);
    } else if (token === '--min-savings-bytes') {
      options.minSavingsBytes = Number(argv[++index]);
    } else if (token === '--report') options.report = argv[++index];
    else if (token === '--force') options.force = true;
    else if (token === '--confirm-production') options.confirmProduction = true;
    else if (token === '--delete-originals') options.deleteOriginals = true;
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (!MODES.has(options.mode)) throw new Error(`Unsupported mode: ${options.mode}`);
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 8) {
    throw new Error('--workers must be an integer from 1 to 8.');
  }
  if (
    options.limit !== null &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  ) {
    throw new Error('--limit must be a positive integer.');
  }
  if (
    !Number.isFinite(options.minSavingsPercent) ||
    options.minSavingsPercent < 0 ||
    options.minSavingsPercent > 100
  ) {
    throw new Error('--min-savings-percent must be from 0 to 100.');
  }
  if (
    !Number.isInteger(options.minSavingsBytes) ||
    options.minSavingsBytes < 0
  ) {
    throw new Error('--min-savings-bytes must be a non-negative integer.');
  }
  if (options.mode !== 'dry-run' && !options.confirmProduction) {
    throw new Error(`${options.mode} requires --confirm-production.`);
  }
  if (options.mode === 'cleanup' && !options.deleteOriginals) {
    throw new Error('cleanup also requires --delete-originals.');
  }
  return options;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function createAdminClient() {
  return createClient(
    requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { 'X-Client-Info': 'dp-resources-question-bank-asset-optimizer' },
      },
    },
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function extensionForContentType(contentType) {
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/jpeg') return '.jpg';
  if (contentType === 'image/svg+xml') return '.svg';
  throw new Error(`No extension configured for ${contentType}.`);
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
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
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    }
  }
  throw latest;
}

export function minifySvg(source) {
  return source
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+\/>/g, '/>')
    .trim();
}

function chooseSmallest(candidates) {
  return candidates.reduce((smallest, candidate) =>
    !smallest || candidate.body.byteLength < smallest.body.byteLength
      ? candidate
      : smallest,
  null);
}

async function rasterCandidates(body, contentType) {
  const image = sharp(body, { failOn: 'error', limitInputPixels: false });
  const metadata = await image.metadata();
  if (Number(metadata.pages || 1) > 1) {
    return { unsupportedReason: 'animated_raster', candidates: [] };
  }

  const normalized = image.rotate();
  if (contentType === 'image/png') {
    const [png, webp] = await Promise.all([
      normalized
        .clone()
        .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
        .toBuffer(),
      normalized.clone().webp({ lossless: true, effort: 6 }).toBuffer(),
    ]);
    return {
      candidates: [
        { body: png, contentType: 'image/png', strategy: 'png-lossless' },
        { body: webp, contentType: 'image/webp', strategy: 'webp-lossless' },
      ],
    };
  }

  const webp = await normalized
    .webp({
      quality: 92,
      alphaQuality: 100,
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer();
  return {
    candidates: [
      { body: webp, contentType: 'image/webp', strategy: 'webp-quality-92' },
    ],
  };
}

export async function optimizeAssetBody({
  body,
  contentType,
  minSavingsPercent = 5,
  minSavingsBytes = 1024,
}) {
  if (!Buffer.isBuffer(body)) body = Buffer.from(body);
  if (!SUPPORTED_TYPES.has(contentType)) {
    return {
      status: 'unsupported',
      reason: `unsupported_content_type:${contentType}`,
      originalBytes: body.byteLength,
    };
  }

  let candidates;
  if (RASTER_TYPES.has(contentType)) {
    const result = await rasterCandidates(body, contentType);
    if (result.unsupportedReason) {
      return {
        status: 'unsupported',
        reason: result.unsupportedReason,
        originalBytes: body.byteLength,
      };
    }
    candidates = result.candidates;
  } else {
    const source = body.toString('utf8');
    const optimized = Buffer.from(minifySvg(source), 'utf8');
    candidates = [
      {
        body: optimized,
        contentType: 'image/svg+xml',
        strategy: 'svg-conservative-minify',
      },
    ];
  }

  const selected = chooseSmallest(candidates);
  const savedBytes = body.byteLength - selected.body.byteLength;
  const savedPercent = body.byteLength
    ? (savedBytes / body.byteLength) * 100
    : 0;
  const adopt =
    savedBytes >= minSavingsBytes && savedPercent >= minSavingsPercent;

  if (!adopt) {
    return {
      status: 'not_smaller',
      originalBytes: body.byteLength,
      candidateBytes: selected.body.byteLength,
      savedBytes,
      savedPercent,
      strategy: selected.strategy,
    };
  }

  return {
    status: 'optimized',
    body: selected.body,
    contentType: selected.contentType,
    fileExtension: extensionForContentType(selected.contentType),
    optimizedHash: sha256(selected.body),
    originalBytes: body.byteLength,
    optimizedBytes: selected.body.byteLength,
    savedBytes,
    savedPercent,
    strategy: selected.strategy,
  };
}

async function fetchPaged(client, table, columns, applyFilters = (query) => query) {
  const output = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = client
      .from(table)
      .select(columns)
      .order('asset_id' in Object.fromEntries(columns.split(',').map((key) => [key.trim(), true])) ? 'asset_id' : 'id')
      .range(offset, offset + pageSize - 1);
    query = applyFilters(query);
    const { data, error } = await retry(() => query, 4);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    output.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return output;
}

async function fetchAssets(client) {
  const output = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await retry(
      () =>
        client
          .from('dp_qb_assets')
          .select(
            'id,content_hash,content_type,file_extension,byte_size,storage_provider,storage_bucket,storage_key,verification_status',
          )
          .eq('storage_provider', 'r2')
          .eq('verification_status', 'verified')
          .like('content_type', 'image/%')
          .order('id')
          .range(offset, offset + pageSize - 1),
      4,
    );
    if (error) throw new Error(`dp_qb_assets read failed: ${error.message}`);
    output.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return output;
}

async function fetchOptimizations(client) {
  const output = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await retry(
      () =>
        client
          .from('dp_qb_asset_optimizations')
          .select(
            'asset_id,source_content_hash,optimized_content_hash,content_type,file_extension,byte_size,storage_bucket,storage_key,optimization_version,verification_status,source_object_deleted_at,last_error',
          )
          .order('asset_id')
          .range(offset, offset + pageSize - 1),
      4,
    );
    if (error) {
      throw new Error(
        `dp_qb_asset_optimizations read failed: ${error.message}. Apply the asset optimization migration first.`,
      );
    }
    output.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return output;
}

async function verifiedR2Body({ bucket, key, expectedBytes, expectedHash }) {
  const response = await getPrivateR2Object({
    bucket,
    key,
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`R2 object ${key} returned ${response.status}.`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength !== Number(expectedBytes)) {
    throw new Error(
      `R2 size mismatch for ${key}: expected ${expectedBytes}, received ${body.byteLength}.`,
    );
  }
  const digest = sha256(body);
  if (digest !== expectedHash) {
    throw new Error(`R2 SHA-256 mismatch for ${key}.`);
  }
  return body;
}

async function persistOptimization(client, asset, result, storageKey) {
  const now = new Date().toISOString();
  const { error } = await client.from('dp_qb_asset_optimizations').upsert(
    {
      asset_id: asset.id,
      source_content_hash: asset.content_hash,
      optimized_content_hash: result.optimizedHash,
      content_type: result.contentType,
      file_extension: result.fileExtension,
      byte_size: result.optimizedBytes,
      storage_provider: 'r2',
      storage_bucket: asset.storage_bucket,
      storage_key: storageKey,
      optimization_version: OPTIMIZATION_VERSION,
      verification_status: 'verified',
      verified_at: now,
      source_object_deleted_at: null,
      last_error: null,
      updated_at: now,
    },
    { onConflict: 'asset_id' },
  );
  if (error) throw new Error(`Unable to persist optimization: ${error.message}`);
}

async function optimizeOneAsset(client, asset, options) {
  if (!SUPPORTED_TYPES.has(asset.content_type)) {
    return {
      assetId: asset.id,
      status: 'unsupported',
      contentType: asset.content_type,
      originalBytes: Number(asset.byte_size),
    };
  }

  const body = await verifiedR2Body({
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    expectedBytes: asset.byte_size,
    expectedHash: asset.content_hash,
  });
  const result = await optimizeAssetBody({
    body,
    contentType: asset.content_type,
    minSavingsPercent: options.minSavingsPercent,
    minSavingsBytes: options.minSavingsBytes,
  });
  if (result.status !== 'optimized') {
    return { assetId: asset.id, contentType: asset.content_type, ...result };
  }

  const storageKey = `question-bank/assets/optimized/sha256/${result.optimizedHash.slice(0, 2)}/${result.optimizedHash}${result.fileExtension}`;
  if (options.mode === 'optimize') {
    await putPrivateR2Object({
      bucket: asset.storage_bucket,
      key: storageKey,
      body: result.body,
      contentType: result.contentType,
      cacheControl: 'private, max-age=31536000, immutable',
      signal: AbortSignal.timeout(90_000),
    });
    await verifiedR2Body({
      bucket: asset.storage_bucket,
      key: storageKey,
      expectedBytes: result.optimizedBytes,
      expectedHash: result.optimizedHash,
    });
    await persistOptimization(client, asset, result, storageKey);
  }

  return {
    assetId: asset.id,
    contentType: asset.content_type,
    status: 'optimized',
    strategy: result.strategy,
    originalBytes: result.originalBytes,
    optimizedBytes: result.optimizedBytes,
    savedBytes: result.savedBytes,
    savedPercent: result.savedPercent,
    optimizedContentType: result.contentType,
    storageKey,
  };
}

function summarize(results) {
  const counts = {};
  let originalBytes = 0;
  let optimizedBytes = 0;
  let savedBytes = 0;
  for (const result of results) {
    counts[result.status] = (counts[result.status] || 0) + 1;
    if (result.status === 'optimized') {
      originalBytes += Number(result.originalBytes || 0);
      optimizedBytes += Number(result.optimizedBytes || 0);
      savedBytes += Number(result.savedBytes || 0);
    }
  }
  return {
    counts,
    originalBytes,
    optimizedBytes,
    savedBytes,
    savedPercent: originalBytes ? (savedBytes / originalBytes) * 100 : 0,
  };
}

async function runOptimization(client, options) {
  const [allAssets, optimizations] = await Promise.all([
    fetchAssets(client),
    fetchOptimizations(client),
  ]);
  const optimizedByAsset = new Map(
    optimizations
      .filter((row) => row.verification_status === 'verified')
      .map((row) => [row.asset_id, row]),
  );
  let candidates = allAssets.filter(
    (asset) => options.force || !optimizedByAsset.has(asset.id),
  );
  if (options.limit !== null) candidates = candidates.slice(0, options.limit);

  const results = new Array(candidates.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const asset = candidates[index];
      try {
        results[index] = await retry(
          () => optimizeOneAsset(client, asset, options),
          3,
        );
      } catch (error) {
        results[index] = {
          assetId: asset.id,
          status: 'failed',
          contentType: asset.content_type,
          originalBytes: Number(asset.byte_size),
          error: String(error.message || error).slice(0, 1000),
        };
      }
      completed += 1;
      if (completed % 100 === 0 || completed === candidates.length) {
        const summary = summarize(results.filter(Boolean));
        process.stdout.write(
          `Question Bank assets ${completed}/${candidates.length}; optimized ${summary.counts.optimized || 0}; failed ${summary.counts.failed || 0}\n`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: options.workers }, worker));
  return {
    mode: options.mode,
    optimizationVersion: OPTIMIZATION_VERSION,
    totalVerifiedR2Images: allAssets.length,
    existingVerifiedOptimizations: optimizedByAsset.size,
    candidates: candidates.length,
    ...summarize(results),
    failures: results
      .filter((result) => result?.status === 'failed')
      .slice(0, 100),
    results,
  };
}

async function fetchAssetsByIds(client, ids) {
  const output = new Map();
  for (const group of chunks(ids, 200)) {
    const { data, error } = await retry(
      () =>
        client
          .from('dp_qb_assets')
          .select('id,content_hash,byte_size,storage_bucket,storage_key')
          .in('id', group),
      4,
    );
    if (error) throw new Error(`dp_qb_assets cleanup read failed: ${error.message}`);
    for (const row of data || []) output.set(row.id, row);
  }
  return output;
}

async function cleanupOne(client, optimization, asset) {
  if (!asset) throw new Error(`Canonical asset ${optimization.asset_id} is missing.`);
  if (asset.storage_key === optimization.storage_key) {
    throw new Error('Refusing to delete an object that is also the optimized key.');
  }

  await verifiedR2Body({
    bucket: optimization.storage_bucket,
    key: optimization.storage_key,
    expectedBytes: optimization.byte_size,
    expectedHash: optimization.optimized_content_hash,
  });
  await deletePrivateR2Object({
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    signal: AbortSignal.timeout(60_000),
  });
  const { error } = await client
    .from('dp_qb_asset_optimizations')
    .update({
      source_object_deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('asset_id', optimization.asset_id);
  if (error) throw new Error(`Unable to record original cleanup: ${error.message}`);

  return {
    assetId: optimization.asset_id,
    status: 'deleted_original',
    deletedBytes: Number(asset.byte_size),
  };
}

async function runCleanup(client, options) {
  let optimizations = (await fetchOptimizations(client)).filter(
    (row) =>
      row.verification_status === 'verified' && !row.source_object_deleted_at,
  );
  if (options.limit !== null) optimizations = optimizations.slice(0, options.limit);
  const assets = await fetchAssetsByIds(
    client,
    optimizations.map((row) => row.asset_id),
  );
  const results = new Array(optimizations.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= optimizations.length) return;
      const optimization = optimizations[index];
      try {
        results[index] = await retry(
          () => cleanupOne(client, optimization, assets.get(optimization.asset_id)),
          3,
        );
      } catch (error) {
        results[index] = {
          assetId: optimization.asset_id,
          status: 'failed',
          error: String(error.message || error).slice(0, 1000),
        };
      }
      completed += 1;
      if (completed % 100 === 0 || completed === optimizations.length) {
        const failed = results.filter((result) => result?.status === 'failed').length;
        process.stdout.write(
          `Original cleanup ${completed}/${optimizations.length}; failures ${failed}\n`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: options.workers }, worker));
  return {
    mode: 'cleanup',
    candidates: optimizations.length,
    deletedOriginals: results.filter(
      (result) => result?.status === 'deleted_original',
    ).length,
    deletedBytes: results.reduce(
      (total, result) => total + Number(result?.deletedBytes || 0),
      0,
    ),
    failures: results.filter((result) => result?.status === 'failed'),
    results,
  };
}

function defaultReportPath(options) {
  if (options.report) return path.resolve(options.report);
  return path.resolve(
    '.question-bank-reports',
    `asset-optimization-${options.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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

  const client = createAdminClient();
  const startedAt = new Date().toISOString();
  const operation =
    options.mode === 'cleanup'
      ? await runCleanup(client, options)
      : await runOptimization(client, options);
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    options: {
      mode: options.mode,
      workers: options.workers,
      limit: options.limit,
      minSavingsPercent: options.minSavingsPercent,
      minSavingsBytes: options.minSavingsBytes,
      force: options.force,
    },
    ...operation,
  };
  const reportPath = defaultReportPath(options);
  await saveReport(reportPath, report);
  process.stdout.write(`${JSON.stringify({ reportPath, ...operation }, null, 2)}\n`);

  if (operation.failures?.length) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { optimizeAssetBody, OPTIMIZATION_VERSION } from './optimize-question-bank-assets.mjs';
import { getPrivateR2Object, putPrivateR2Object } from './r2-s3.mjs';

const STAGE = 'dp_qb_remote_asset_backfill_stage_20260919';
const CONTROL = 'dp_qb_remote_asset_backfill_control_20260919';
const SOURCE_KEY_PREFIX = 'remote-image:';
const MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_WORKERS = 6;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'dp-resources-remote-qb-asset-finalizer' } },
  },
);
const r2Bucket = required('R2_QUESTION_BANK_BUCKET');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function extensionFor(contentType, url = '') {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/png') return { contentType: type, extension: '.png' };
  if (type === 'image/jpeg' || type === 'image/jpg')
    return { contentType: 'image/jpeg', extension: '.jpg' };
  if (type === 'image/webp') return { contentType: type, extension: '.webp' };
  if (type === 'image/gif') return { contentType: type, extension: '.gif' };
  if (type === 'image/svg+xml' || type === 'image/svg')
    return { contentType: 'image/svg+xml', extension: '.svg' };
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (pathname.endsWith('.png')) return { contentType: 'image/png', extension: '.png' };
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg'))
    return { contentType: 'image/jpeg', extension: '.jpg' };
  if (pathname.endsWith('.webp')) return { contentType: 'image/webp', extension: '.webp' };
  if (pathname.endsWith('.gif')) return { contentType: 'image/gif', extension: '.gif' };
  if (pathname.endsWith('.svg')) return { contentType: 'image/svg+xml', extension: '.svg' };
  return null;
}

function sniff(body, header, url) {
  let resolved = extensionFor(header, url);
  if (resolved) return resolved;
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47
  )
    return { contentType: 'image/png', extension: '.png' };
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)
    return { contentType: 'image/jpeg', extension: '.jpg' };
  if (body.length >= 6 && body.subarray(0, 6).toString('ascii').startsWith('GIF8'))
    return { contentType: 'image/gif', extension: '.gif' };
  if (body.length >= 12 && body.subarray(8, 12).toString('ascii') === 'WEBP')
    return { contentType: 'image/webp', extension: '.webp' };
  const prefix = body.subarray(0, Math.min(body.length, 512)).toString('utf8').trimStart().toLowerCase();
  if (prefix.startsWith('<svg') || (prefix.startsWith('<?xml') && prefix.includes('<svg')))
    return { contentType: 'image/svg+xml', extension: '.svg' };
  throw new Error('Unable to identify image content type.');
}

function originalFilename(url, extension) {
  try {
    const value = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1) || '');
    if (value && value.length <= 240) return value;
  } catch {}
  return `remote-image${extension}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function replaceRemoteMarkdown(source, url, sourceFileId) {
  if (!source) return source;
  const pattern = new RegExp(
    `!\\[([^\\]]*)\\]\\(${escapeRegex(url)}\\)`,
    'g',
  );
  return source.replace(
    pattern,
    (_full, alt) => `![${alt || ''}](question:${sourceFileId})`,
  );
}

async function retry(operation, attempts = 4) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      last = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw last;
}

async function readAll(table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('question_id')
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchStoredAsset(assetId) {
  if (!assetId) return null;
  const { data: asset, error } = await supabase
    .from('dp_qb_assets')
    .select(
      'id,content_hash,content_type,file_extension,byte_size,storage_provider,storage_bucket,storage_key,verification_status',
    )
    .eq('id', assetId)
    .maybeSingle();
  if (error || !asset || asset.verification_status !== 'verified') return null;

  let body;
  if (asset.storage_provider === 'r2') {
    const response = await getPrivateR2Object({
      bucket: asset.storage_bucket,
      key: asset.storage_key,
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) return null;
    body = Buffer.from(await response.arrayBuffer());
  } else if (asset.storage_provider === 'supabase') {
    const { data, error: downloadError } = await supabase.storage
      .from(asset.storage_bucket)
      .download(asset.storage_key);
    if (downloadError || !data) return null;
    body = Buffer.from(await data.arrayBuffer());
  } else {
    return null;
  }

  if (body.length !== Number(asset.byte_size) || sha256(body) !== asset.content_hash)
    throw new Error(`Stored fallback asset verification failed for ${asset.id}`);
  return {
    body,
    contentType: asset.content_type,
    extension: asset.file_extension,
  };
}

async function fetchSource(row) {
  try {
    const response = await fetch(row.source_url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'DPResources-Authorized-Asset-Backfill/2.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Source image fetch returned HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length) throw new Error('Source image was empty.');
    if (body.length > MAX_BYTES)
      throw new Error(`Source image exceeds ${MAX_BYTES} bytes.`);
    const { contentType, extension } = sniff(
      body,
      response.headers.get('content-type'),
      row.source_url,
    );
    return { body, contentType, extension };
  } catch (sourceError) {
    const fallback = await fetchStoredAsset(row.asset_id);
    if (fallback) return fallback;
    throw sourceError;
  }
}

async function verifyR2(bucket, key, expectedBody) {
  const response = await getPrivateR2Object({
    bucket,
    key,
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok)
    throw new Error(`R2 verification returned HTTP ${response.status} for ${key}`);
  const stored = Buffer.from(await response.arrayBuffer());
  if (stored.length !== expectedBody.length)
    throw new Error(`R2 size verification failed for ${key}`);
  if (sha256(stored) !== sha256(expectedBody))
    throw new Error(`R2 SHA-256 verification failed for ${key}`);
}

async function uploadVerifiedR2(key, body, contentType) {
  await putPrivateR2Object({
    bucket: r2Bucket,
    key,
    body,
    contentType,
    cacheControl: 'private, max-age=31536000, immutable',
    signal: AbortSignal.timeout(90_000),
  });
  await verifyR2(r2Bucket, key, body);
}

async function findAssetByHash(contentHash) {
  const { data, error } = await supabase
    .from('dp_qb_assets')
    .select(
      'id,content_hash,content_type,file_extension,byte_size,storage_provider,storage_bucket,storage_key,verification_status',
    )
    .eq('content_hash', contentHash)
    .maybeSingle();
  if (error) throw new Error(`Asset lookup failed: ${error.message}`);
  return data || null;
}

async function migrateCanonicalToR2(asset, source, sourceHash) {
  const key = `question-bank/assets/sha256/${sourceHash.slice(0, 2)}/${sourceHash}${source.extension}`;
  await uploadVerifiedR2(key, source.body, source.contentType);

  const previous =
    asset &&
    asset.storage_provider === 'supabase' &&
    asset.storage_bucket &&
    asset.storage_key
      ? {
          bucket: asset.storage_bucket,
          key: asset.storage_key,
        }
      : null;

  const id = asset?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const payload = {
    id,
    content_hash: sourceHash,
    canonical_source_path: key,
    original_filename: asset?.original_filename || 'remote-image' + source.extension,
    file_extension: source.extension,
    content_type: source.contentType,
    byte_size: source.body.length,
    storage_provider: 'r2',
    storage_bucket: r2Bucket,
    storage_key: key,
    upload_status: 'uploaded',
    verification_status: 'verified',
    uploaded_at: now,
    verified_at: now,
    last_error: null,
  };

  const { data: upserted, error } = await supabase
    .from('dp_qb_assets')
    .upsert(payload, { onConflict: 'content_hash' })
    .select('id')
    .single();
  if (error) throw new Error(`Canonical asset upsert failed: ${error.message}`);

  if (previous && (previous.bucket !== r2Bucket || previous.key !== key)) {
    const { error: removeError } = await supabase.storage
      .from(previous.bucket)
      .remove([previous.key]);
    if (removeError)
      process.stderr.write(
        `Warning: old Supabase object cleanup failed for ${previous.key}: ${removeError.message}\n`,
      );
  }

  return { assetId: upserted.id, key };
}

async function optimizeAndPersist(assetId, source, sourceHash) {
  const result = await optimizeAssetBody({
    body: source.body,
    contentType: source.contentType,
    minSavingsPercent: 5,
    minSavingsBytes: 1024,
  });

  if (result.status !== 'optimized') {
    const { error } = await supabase
      .from('dp_qb_asset_optimizations')
      .delete()
      .eq('asset_id', assetId);
    if (error) throw new Error(`Optimization cleanup failed: ${error.message}`);
    return {
      status: result.status,
      originalBytes: source.body.length,
      savedBytes: 0,
      strategy: result.strategy || null,
    };
  }

  const key = `question-bank/assets/optimized/sha256/${result.optimizedHash.slice(
    0,
    2,
  )}/${result.optimizedHash}${result.fileExtension}`;
  await uploadVerifiedR2(key, result.body, result.contentType);

  const now = new Date().toISOString();
  const { error } = await supabase.from('dp_qb_asset_optimizations').upsert(
    {
      asset_id: assetId,
      source_content_hash: sourceHash,
      optimized_content_hash: result.optimizedHash,
      content_type: result.contentType,
      file_extension: result.fileExtension,
      byte_size: result.optimizedBytes,
      storage_provider: 'r2',
      storage_bucket: r2Bucket,
      storage_key: key,
      optimization_version: OPTIMIZATION_VERSION,
      verification_status: 'verified',
      verified_at: now,
      source_object_deleted_at: null,
      last_error: null,
      updated_at: now,
    },
    { onConflict: 'asset_id' },
  );
  if (error) throw new Error(`Optimization row upsert failed: ${error.message}`);

  return {
    status: 'optimized',
    originalBytes: result.originalBytes,
    optimizedBytes: result.optimizedBytes,
    savedBytes: result.savedBytes,
    savedPercent: result.savedPercent,
    strategy: result.strategy,
  };
}

async function ensureSourceAlias(row, assetId, sourceFileId, source) {
  const sourceKey = `${SOURCE_KEY_PREFIX}${row.question_id}:${sha256(row.source_url)}`;
  const { data: existing, error: lookupError } = await supabase
    .from('dp_qb_asset_sources')
    .select('id,source_file_id')
    .eq('source_key', sourceKey)
    .maybeSingle();
  if (lookupError) throw new Error(`Asset source lookup failed: ${lookupError.message}`);

  const finalSourceFileId = existing?.source_file_id || sourceFileId || crypto.randomUUID();
  const payload = {
    id: existing?.id || crypto.randomUUID(),
    asset_id: assetId,
    source_key: sourceKey,
    source_file_id: finalSourceFileId,
    source_question_id: row.question_id,
    original_filename: originalFilename(row.source_url, source.extension),
    original_source_path: row.source_url,
    original_source_url: row.source_url,
    canonical_normalized_source_path: row.source_url,
  };

  const { data, error } = await supabase
    .from('dp_qb_asset_sources')
    .upsert(payload, { onConflict: 'source_key' })
    .select('source_file_id')
    .single();
  if (error) throw new Error(`Asset source upsert failed: ${error.message}`);
  return data.source_file_id;
}

async function processQuestion(rows) {
  const questionId = rows[0].question_id;
  const [{ data: question, error: questionError }, { data: variants, error: variantError }] =
    await Promise.all([
      supabase
        .from('dp_qb_questions')
        .select('id,content,mark_scheme')
        .eq('id', questionId)
        .single(),
      supabase
        .from('dp_qb_question_variants')
        .select('id')
        .eq('question_id', questionId),
    ]);
  if (questionError || !question)
    throw new Error(`Question lookup failed for ${questionId}: ${questionError?.message || 'missing'}`);
  if (variantError)
    throw new Error(`Variant lookup failed for ${questionId}: ${variantError.message}`);

  let content = question.content || '';
  let markScheme = question.mark_scheme || '';
  const itemResults = [];

  for (let ordinal = 0; ordinal < rows.length; ordinal += 1) {
    const row = rows[ordinal];
    try {
      const source = await retry(() => fetchSource(row), 3);
      const sourceHash = sha256(source.body);
      const existingAsset = await findAssetByHash(sourceHash);
      const { assetId } = await migrateCanonicalToR2(
        existingAsset
          ? {
              ...existingAsset,
              original_filename: originalFilename(row.source_url, source.extension),
            }
          : null,
        source,
        sourceHash,
      );
      const sourceFileId = await ensureSourceAlias(
        row,
        assetId,
        row.source_file_id,
        source,
      );

      const links = (variants || []).map((variant) => ({
        variant_id: variant.id,
        asset_id: assetId,
        source_file_id: sourceFileId,
        role: row.role,
        sort_order: 1000 + ordinal,
        alt_text: row.alt_text || null,
      }));
      if (links.length) {
        const { error } = await supabase
          .from('dp_qb_variant_assets')
          .upsert(links, { onConflict: 'variant_id,asset_id,role' });
        if (error) throw new Error(`Variant asset link failed: ${error.message}`);
      }

      if (row.role === 'question')
        content = replaceRemoteMarkdown(content, row.source_url, sourceFileId);
      else
        markScheme = replaceRemoteMarkdown(markScheme, row.source_url, sourceFileId);

      const optimization = await optimizeAndPersist(assetId, source, sourceHash);

      const { error: stageError } = await supabase
        .from(STAGE)
        .update({
          status: 'complete',
          asset_id: assetId,
          source_file_id: sourceFileId,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (stageError) throw new Error(`Stage update failed: ${stageError.message}`);

      itemResults.push({
        id: row.id,
        sourceUrl: row.source_url,
        assetId,
        sourceFileId,
        status: 'complete',
        optimization,
      });
    } catch (error) {
      const message = String(error?.message || error).slice(0, 1000);
      await supabase
        .from(STAGE)
        .update({
          status: 'failed',
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      itemResults.push({
        id: row.id,
        sourceUrl: row.source_url,
        status: 'failed',
        error: message,
      });
    }
  }

  if (content !== question.content || markScheme !== question.mark_scheme) {
    const { error } = await retry(
      () =>
        supabase
          .from('dp_qb_questions')
          .update({ content, mark_scheme: markScheme })
          .eq('id', questionId),
      4,
    );
    if (error) throw new Error(`Question rewrite failed: ${error.message}`);
  }

  return itemResults;
}

async function main() {
  if (!process.argv.includes('--confirm-production'))
    throw new Error('Refusing production finalization without --confirm-production.');

  const workersArg = process.argv.indexOf('--workers');
  const workers =
    workersArg >= 0
      ? Math.max(1, Math.min(Number(process.argv[workersArg + 1] || DEFAULT_WORKERS), 8))
      : DEFAULT_WORKERS;
  const reportArg = process.argv.indexOf('--report');
  const reportPath =
    reportArg >= 0
      ? path.resolve(process.argv[reportArg + 1])
      : path.resolve(
          '.question-bank-reports',
          `remote-asset-finalize-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        );

  const startedAt = new Date().toISOString();
  const rows = await readAll(
    STAGE,
    'id,question_id,role,source_url,alt_text,status,attempts,asset_id,source_file_id,last_error',
  );
  const groups = [...Map.groupBy(rows, (row) => row.question_id).values()];
  const results = new Array(groups.length);
  let cursor = 0;
  let completedGroups = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= groups.length) return;
      try {
        results[index] = await processQuestion(groups[index]);
      } catch (error) {
        results[index] = groups[index].map((row) => ({
          id: row.id,
          sourceUrl: row.source_url,
          status: 'failed',
          error: String(error?.message || error).slice(0, 1000),
        }));
      }
      completedGroups += 1;
      if (completedGroups % 100 === 0 || completedGroups === groups.length) {
        const flat = results.flat().filter(Boolean);
        const done = flat.filter((row) => row.status === 'complete').length;
        const failed = flat.filter((row) => row.status === 'failed').length;
        process.stdout.write(
          `Remote QB assets: questions ${completedGroups}/${groups.length}; complete refs ${done}; failed refs ${failed}\n`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));

  const flat = results.flat().filter(Boolean);
  const optimized = flat.filter((row) => row.optimization?.status === 'optimized');
  const failures = flat.filter((row) => row.status === 'failed');

  const { data: stageCounts, error: stageCountError } = await supabase
    .from(STAGE)
    .select('status');
  if (stageCountError) throw new Error(`Stage final count failed: ${stageCountError.message}`);
  const statuses = Object.fromEntries(
    [...new Set((stageCounts || []).map((row) => row.status))].map((status) => [
      status,
      (stageCounts || []).filter((row) => row.status === status).length,
    ]),
  );

  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    stageRows: rows.length,
    questionGroups: groups.length,
    statusCounts: statuses,
    optimizedAssets: optimized.length,
    optimizedOriginalBytes: optimized.reduce(
      (sum, row) => sum + Number(row.optimization.originalBytes || 0),
      0,
    ),
    optimizedDeliveryBytes: optimized.reduce(
      (sum, row) => sum + Number(row.optimization.optimizedBytes || 0),
      0,
    ),
    optimizedSavedBytes: optimized.reduce(
      (sum, row) => sum + Number(row.optimization.savedBytes || 0),
      0,
    ),
    failures,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ reportPath, ...report }, null, 2) + '\n');

  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + '\n');
  process.exitCode = 1;
});

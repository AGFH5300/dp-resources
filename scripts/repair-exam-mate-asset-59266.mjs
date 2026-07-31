#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import {
  deletePrivateR2Object,
  getPrivateR2Object,
  headPrivateR2Object,
  putPrivateR2Object,
} from './r2-s3.mjs';
import { deterministicUuid } from './question-bank/archive.mjs';
import { EXAM_MATE_TRUNCATED_PNG_REPAIR } from './question-bank/exam-mate-optimization.mjs';

const CONFIRMATION = 'REPAIR-EXAM-MATE-ASSET-59266';
const VARIANT_ID = 'cc68d2d7-c1f6-56a7-b56d-0ef72314977e';
const QUESTION_ID = '22005d22-a618-53f3-b6f4-0f72ca4723eb';
const SOURCE_FILE_ID = '26844468-e6f4-59af-a232-f7e21c0df69d';
const OLD_ASSET_ID = 'ac4b88b4-2f2b-5d22-8acb-6ca13d8bcdde';
const NEW_ASSET_ID = deterministicUuid(
  `asset:${EXAM_MATE_TRUNCATED_PNG_REPAIR.replacementHash}`,
);
const SOURCE_KEY =
  `exam-mate:${EXAM_MATE_TRUNCATED_PNG_REPAIR.sourceQuestionId}:question:0:` +
  EXAM_MATE_TRUNCATED_PNG_REPAIR.sourceUrl;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseArguments(argv) {
  const options = {
    asset: null,
    bucket: null,
    confirmation: null,
    report: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--asset') options.asset = argv[++index];
    else if (token === '--bucket') options.bucket = argv[++index];
    else if (token === '--confirmation') options.confirmation = argv[++index];
    else if (token === '--report') options.report = argv[++index];
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.asset) throw new Error('--asset is required.');
  if (!options.bucket) throw new Error('--bucket is required.');
  if (options.confirmation !== CONFIRMATION) {
    throw new Error(`--confirmation must be ${CONFIRMATION}.`);
  }
  return options;
}

function createProductionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function maybeSingle(client, table, columns, column, value) {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq(column, value)
    .maybeSingle();
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  return data;
}

async function exactRows(client, table, columns, configure) {
  let query = client.from(table).select(columns);
  query = configure(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  return data || [];
}

async function verifyReplacementFile(filePath) {
  const body = await readFile(filePath);
  const repair = EXAM_MATE_TRUNCATED_PNG_REPAIR;
  if (
    sha256(body) !== repair.replacementHash ||
    body.byteLength !== repair.replacementBytes ||
    body.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  ) {
    throw new Error('Replacement PNG hash, byte count, or signature mismatch.');
  }
  const metadata = await sharp(body, {
    failOn: 'error',
    limitInputPixels: false,
  }).metadata();
  if (
    metadata.format !== 'png' ||
    metadata.width !== repair.width ||
    metadata.height !== repair.height ||
    metadata.channels !== 3
  ) {
    throw new Error('Replacement PNG dimensions or color channels mismatch.');
  }
  await sharp(body, {
    failOn: 'error',
    limitInputPixels: false,
  })
    .raw()
    .toBuffer();
  return body;
}

function verifyObjectHeaders(response, hash, bytes) {
  return (
    response.ok &&
    Number(response.headers.get('content-length')) === bytes &&
    String(response.headers.get('x-amz-meta-sha256') || '').toLowerCase() ===
      hash
  );
}

async function verifyObject(bucket, key, hash, bytes) {
  const response = await getPrivateR2Object({
    bucket,
    key,
    signal: AbortSignal.timeout(90_000),
  });
  if (!verifyObjectHeaders(response, hash, bytes)) return false;
  const body = Buffer.from(await response.arrayBuffer());
  return body.byteLength === bytes && sha256(body) === hash;
}

async function ensureNewObject(bucket, key, body) {
  const repair = EXAM_MATE_TRUNCATED_PNG_REPAIR;
  const head = await headPrivateR2Object({
    bucket,
    key,
    signal: AbortSignal.timeout(90_000),
  });
  if (head.status === 404) {
    await putPrivateR2Object({
      bucket,
      key,
      body,
      contentType: repair.contentType,
      cacheControl: 'private, no-store, max-age=0',
      sha256Metadata: repair.replacementHash,
      signal: AbortSignal.timeout(90_000),
    });
  } else if (
    !verifyObjectHeaders(
      head,
      repair.replacementHash,
      repair.replacementBytes,
    )
  ) {
    throw new Error('Existing replacement object metadata is not exact.');
  }
  if (
    !(await verifyObject(
      bucket,
      key,
      repair.replacementHash,
      repair.replacementBytes,
    ))
  ) {
    throw new Error('Replacement object read-back verification failed.');
  }
}

async function updateExactLink(
  client,
  table,
  match,
  oldAssetId,
  newAssetId,
  patch,
) {
  const rows = await exactRows(
    client,
    table,
    'asset_id',
    (query) => {
      let filtered = query;
      for (const [column, value] of Object.entries(match)) {
        filtered = filtered.eq(column, value);
      }
      return filtered;
    },
  );
  if (rows.length !== 1) {
    throw new Error(`${table} expected one exact relationship row.`);
  }
  if (rows[0].asset_id === newAssetId) return;
  if (rows[0].asset_id !== oldAssetId) {
    throw new Error(`${table} points to an unexpected asset.`);
  }
  let update = client
    .from(table)
    .update({ ...patch, asset_id: newAssetId })
    .eq('asset_id', oldAssetId);
  for (const [column, value] of Object.entries(match)) {
    update = update.eq(column, value);
  }
  const { data, error } = await update.select('asset_id');
  if (error) throw new Error(`${table} update failed: ${error.message}`);
  if (data?.length !== 1 || data[0].asset_id !== newAssetId) {
    throw new Error(`${table} exact relationship update was not applied.`);
  }
}

async function assertNoReferences(client, assetId) {
  const [sources, variants] = await Promise.all([
    exactRows(client, 'dp_qb_asset_sources', 'id', (query) =>
      query.eq('asset_id', assetId),
    ),
    exactRows(client, 'dp_qb_variant_assets', 'asset_id', (query) =>
      query.eq('asset_id', assetId),
    ),
  ]);
  if (sources.length || variants.length) {
    throw new Error('The damaged asset still has database references.');
  }
}

async function saveReport(filePath, report) {
  if (!filePath) return;
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repair = EXAM_MATE_TRUNCATED_PNG_REPAIR;
  const body = await verifyReplacementFile(path.resolve(options.asset));
  const client = createProductionClient();
  const oldKey =
    `question-bank/assets/sha256/${repair.originalHash.slice(0, 2)}/` +
    `${repair.originalHash}.png`;
  const newKey =
    `question-bank/assets/sha256/${repair.replacementHash.slice(0, 2)}/` +
    `${repair.replacementHash}.png`;

  const [oldAsset, existingNewAsset] = await Promise.all([
    maybeSingle(client, 'dp_qb_assets', '*', 'id', OLD_ASSET_ID),
    maybeSingle(client, 'dp_qb_assets', '*', 'id', NEW_ASSET_ID),
  ]);
  const template = oldAsset || existingNewAsset;
  if (!template) throw new Error('Neither the old nor replacement asset exists.');
  if (
    oldAsset &&
    (oldAsset.content_hash !== repair.originalHash ||
      Number(oldAsset.byte_size) !== repair.originalBytes ||
      oldAsset.storage_key !== oldKey)
  ) {
    throw new Error('The damaged production asset no longer matches the pin.');
  }
  if (
    existingNewAsset &&
    (existingNewAsset.content_hash !== repair.replacementHash ||
      Number(existingNewAsset.byte_size) !== repair.replacementBytes ||
      existingNewAsset.storage_key !== newKey)
  ) {
    throw new Error('The existing replacement asset no longer matches the pin.');
  }

  await ensureNewObject(options.bucket, newKey, body);
  const now = new Date().toISOString();
  const newAsset = {
    ...template,
    id: NEW_ASSET_ID,
    content_hash: repair.replacementHash,
    canonical_source_path: repair.replacementPath,
    original_filename: '21239_q_61113_40_1.png',
    file_extension: '.png',
    content_type: repair.contentType,
    byte_size: repair.replacementBytes,
    storage_provider: 'r2',
    storage_bucket: options.bucket,
    storage_key: newKey,
    upload_status: 'uploaded',
    verification_status: 'verified',
    uploaded_at: existingNewAsset?.uploaded_at || now,
    verified_at: now,
    last_error: null,
  };
  delete newAsset.local_path;
  const { error: assetError } = await client
    .from('dp_qb_assets')
    .upsert(newAsset, { onConflict: 'id' });
  if (assetError) {
    throw new Error(`Replacement asset upsert failed: ${assetError.message}`);
  }

  await updateExactLink(
    client,
    'dp_qb_asset_sources',
    { source_key: SOURCE_KEY },
    OLD_ASSET_ID,
    NEW_ASSET_ID,
    { canonical_normalized_source_path: repair.replacementPath },
  );
  await updateExactLink(
    client,
    'dp_qb_variant_assets',
    { variant_id: VARIANT_ID, role: 'question' },
    OLD_ASSET_ID,
    NEW_ASSET_ID,
    {
      source_file_id: SOURCE_FILE_ID,
      sort_order: 0,
      alt_text: 'Question image',
    },
  );
  await assertNoReferences(client, OLD_ASSET_ID);

  await deletePrivateR2Object({
    bucket: options.bucket,
    key: oldKey,
    signal: AbortSignal.timeout(90_000),
  });
  const oldHead = await headPrivateR2Object({
    bucket: options.bucket,
    key: oldKey,
    signal: AbortSignal.timeout(90_000),
  });
  if (oldHead.status !== 404) {
    throw new Error('Damaged R2 object was not removed.');
  }
  if (oldAsset) {
    const { data, error } = await client
      .from('dp_qb_assets')
      .delete()
      .eq('id', OLD_ASSET_ID)
      .eq('content_hash', repair.originalHash)
      .select('id');
    if (error) throw new Error(`Damaged asset delete failed: ${error.message}`);
    if (data?.length !== 1) {
      throw new Error('Damaged asset delete did not affect one exact row.');
    }
  }

  const [finalAsset, sourceLinks, variantLinks] = await Promise.all([
    maybeSingle(client, 'dp_qb_assets', '*', 'id', NEW_ASSET_ID),
    exactRows(client, 'dp_qb_asset_sources', 'asset_id,source_question_id', (query) =>
      query.eq('source_key', SOURCE_KEY),
    ),
    exactRows(
      client,
      'dp_qb_variant_assets',
      'asset_id,source_file_id,sort_order,role',
      (query) => query.eq('variant_id', VARIANT_ID).eq('role', 'question'),
    ),
  ]);
  if (
    !finalAsset ||
    finalAsset.content_hash !== repair.replacementHash ||
    sourceLinks.length !== 1 ||
    sourceLinks[0].asset_id !== NEW_ASSET_ID ||
    sourceLinks[0].source_question_id !== QUESTION_ID ||
    variantLinks.length !== 1 ||
    variantLinks[0].asset_id !== NEW_ASSET_ID ||
    variantLinks[0].source_file_id !== SOURCE_FILE_ID ||
    Number(variantLinks[0].sort_order) !== 0 ||
    !(await verifyObject(
      options.bucket,
      newKey,
      repair.replacementHash,
      repair.replacementBytes,
    ))
  ) {
    throw new Error('Final replacement relationship verification failed.');
  }

  const report = {
    verificationStatus: 'passed',
    sourceQuestionId: repair.sourceQuestionId,
    variantId: VARIANT_ID,
    questionId: QUESTION_ID,
    replacementAssetId: NEW_ASSET_ID,
    replacementHash: repair.replacementHash,
    replacementBytes: repair.replacementBytes,
    width: repair.width,
    height: repair.height,
    oldAssetRemoved: true,
    oldObjectRemoved: true,
  };
  await saveReport(options.report, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
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

export {
  NEW_ASSET_ID,
  OLD_ASSET_ID,
  QUESTION_ID,
  SOURCE_FILE_ID,
  SOURCE_KEY,
  VARIANT_ID,
  parseArguments,
  verifyReplacementFile,
};

import { createClient } from '@supabase/supabase-js';

import {
  deletePrivateR2Object,
  headPrivateR2Object,
} from './r2-s3.mjs';

const EXPECTED_ASSET_COUNT = 1_034;
const EXPECTED_BYTE_SIZE = 50_811_545;
const EXPECTED_BUCKET = 'dp-pdf-previews';
const PAGE_SIZE = 500;
const CONCURRENCY = 8;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (
  requiredEnvironment('PURGE_CONFIRMATION') !==
  'DELETE RETIRED QUESTION BANK ASSETS'
) {
  throw new Error('Exact retired-asset purge confirmation is required');
}

const supabase = createClient(
  requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function retry(operation) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 3)
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function loadQueue() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('dp_qb_asset_deletion_queue')
      .select(
        'asset_id, storage_provider, storage_bucket, storage_key, byte_size, deleted_at',
      )
      .order('asset_id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Unable to read deletion queue: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function runPool(rows, operation) {
  let cursor = 0;
  let completed = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor];
      cursor += 1;
      await operation(row);
      completed += 1;
      if (completed % 100 === 0 || completed === rows.length)
        console.log(`Verified ${completed}/${rows.length} retired assets`);
    }
  });
  await Promise.all(workers);
}

const rows = await loadQueue();
const totalBytes = rows.reduce((total, row) => total + Number(row.byte_size), 0);
const uniqueKeys = new Set(
  rows.map((row) => `${row.storage_provider}/${row.storage_bucket}/${row.storage_key}`),
);
if (
  rows.length !== EXPECTED_ASSET_COUNT ||
  totalBytes !== EXPECTED_BYTE_SIZE ||
  uniqueKeys.size !== EXPECTED_ASSET_COUNT ||
  rows.some(
    (row) =>
      row.storage_provider !== 'r2' || row.storage_bucket !== EXPECTED_BUCKET,
  )
) {
  throw new Error('Retired-asset deletion queue does not match the reviewed scope');
}

await runPool(rows, async (row) => {
  if (!row.deleted_at) {
    await retry(() =>
      deletePrivateR2Object({
        bucket: row.storage_bucket,
        key: row.storage_key,
      }),
    );
  }
  const response = await retry(() =>
    headPrivateR2Object({
      bucket: row.storage_bucket,
      key: row.storage_key,
    }),
  );
  if (response.status !== 404)
    throw new Error('A retired R2 asset still exists after deletion');
});

for (let offset = 0; offset < rows.length; offset += 100) {
  const assetIds = rows.slice(offset, offset + 100).map((row) => row.asset_id);
  const { error } = await supabase
    .from('dp_qb_asset_deletion_queue')
    .update({ deleted_at: new Date().toISOString() })
    .in('asset_id', assetIds);
  if (error) throw new Error(`Unable to mark deleted assets: ${error.message}`);
}

const verified = await loadQueue();
if (
  verified.length !== EXPECTED_ASSET_COUNT ||
  verified.some((row) => !row.deleted_at)
) {
  throw new Error('Retired-asset deletion queue was not fully verified');
}

console.log(
  `Deleted and HEAD-verified ${verified.length} retired R2 assets (${EXPECTED_BYTE_SIZE} bytes)`,
);

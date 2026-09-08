import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_PDF_PREVIEW_BUCKET',
]) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const driveFileArg = process.argv.find((value) => value.startsWith('--drive-file-id='));
const driveFileId = driveFileArg?.slice('--drive-file-id='.length).trim() || '';
if (!driveFileId) {
  throw new Error('Usage: node scripts/ops-targeted-pdf-preview-worker-r2.mjs --drive-file-id=<id>');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeModifiedTime(value) {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString().replace(/Z$/, '+00:00')
    : trimmed;
}

function versionKey(file) {
  return createHash('sha256')
    .update(`${file.drive_file_id}\n${normalizeModifiedTime(file.modified_at)}\n${Number(file.size_bytes)}`)
    .digest('hex');
}

function isReady(document) {
  return Boolean(
    document &&
      document.status === 'ready' &&
      Number(document.page_count) > 0 &&
      Number(document.pages_ready) === Number(document.page_count) &&
      document.text_ready_at &&
      document.search_geometry_ready_at &&
      document.storage_provider === 'r2' &&
      document.storage_bucket === process.env.R2_PDF_PREVIEW_BUCKET,
  );
}

async function indexedResource() {
  const { data, error } = await supabase
    .from('dp_resource_index')
    .select('drive_file_id,name,size_bytes,modified_at,mime_type,is_folder')
    .eq('drive_file_id', driveFileId)
    .maybeSingle();
  if (error) throw new Error(`Unable to read indexed resource: ${error.message}`);
  if (!data || data.is_folder || data.mime_type !== 'application/pdf') {
    throw new Error(`Indexed PDF not found for ${driveFileId}`);
  }
  return { ...data, size_bytes: Number(data.size_bytes) };
}

async function queueExactDocument(file) {
  const version = versionKey(file);
  const modifiedAt = normalizeModifiedTime(file.modified_at) || null;
  const bucket = process.env.R2_PDF_PREVIEW_BUCKET;
  const { data, error } = await supabase.rpc('dp_queue_pdf_preview_v2', {
    p_drive_file_id: file.drive_file_id,
    p_source_name: file.name,
    p_source_modified_at: modifiedAt,
    p_source_size_bytes: file.size_bytes,
    p_version_key: version,
    p_storage_prefix: `${file.drive_file_id}/${version}`,
    p_storage_provider: 'r2',
    p_storage_bucket: bucket,
  });
  if (error) throw new Error(`Unable to queue ${file.name}: ${error.message}`);
  let document = Array.isArray(data) ? data[0] || null : data || null;
  if (!document) throw new Error(`Queueing returned no document for ${file.name}`);

  if (isReady(document)) return { version, document };

  if (Number(document.pages_ready) > 0 && document.storage_provider !== 'r2') {
    throw new Error(`Refusing to redirect partially prepared ${file.name} from ${document.storage_provider} to r2`);
  }

  const workerId = `ops-targeted-${driveFileId}-${randomUUID()}`;
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('dp_pdf_preview_documents')
    .update({
      status: Number(document.pages_ready) > 0 ? 'partial' : 'processing',
      attempts: Number(document.attempts || 0) + 1,
      locked_by: workerId,
      lock_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      started_at: document.started_at || now,
      last_error: null,
      storage_provider: 'r2',
      storage_bucket: bucket,
      updated_at: now,
    })
    .eq('id', document.id)
    .select('*')
    .single();
  if (claimError) throw new Error(`Unable to target ${file.name}: ${claimError.message}`);
  document = claimed;
  process.env.PDF_PREVIEW_WORKER_ID = workerId;
  return { version, document };
}

async function exactDocument(version) {
  let lastError = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const { data, error } = await supabase
        .from('dp_pdf_preview_documents')
        .select('*')
        .eq('drive_file_id', driveFileId)
        .eq('version_key', version)
        .maybeSingle();
      if (!error) return data || null;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    const message = lastError?.message || String(lastError);
    console.warn(JSON.stringify({
      event: 'ops_targeted_preview_status_retry',
      driveFileId,
      attempt,
      message,
    }));
    if (attempt < 8) await sleep(Math.min(10_000, 750 * 2 ** (attempt - 1)));
  }
  throw new Error(`Unable to read targeted preview status after retries: ${lastError?.message || String(lastError)}`);
}

async function main() {
  const file = await indexedResource();
  const { version, document } = await queueExactDocument(file);

  if (isReady(document)) {
    console.log(JSON.stringify({
      event: 'ops_targeted_preview_already_ready',
      driveFileId,
      name: file.name,
      pageCount: Number(document.page_count),
    }));
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  let claimServed = false;
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl =
      typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = new URL(requestUrl);
    if (
      !claimServed &&
      method === 'POST' &&
      url.pathname.endsWith('/rest/v1/rpc/dp_claim_pdf_preview_job')
    ) {
      claimServed = true;
      return new Response(JSON.stringify([document]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (
      claimServed &&
      method === 'POST' &&
      url.pathname.endsWith('/rest/v1/rpc/dp_claim_pdf_preview_job')
    ) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };

  if (!process.argv.includes('--once')) process.argv.push('--once');
  process.env.PDF_PREVIEW_STORAGE_PROVIDER = 'r2';
  await import('./pdf-preview-worker-r2.mjs');

  // The imported worker starts its async main loop without exporting it. Poll the
  // exact document so this wrapper cannot exit before the targeted work settles.
  const deadline = Date.now() + 3 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    const current = await exactDocument(version);
    if (isReady(current)) {
      console.log(JSON.stringify({
        event: 'ops_targeted_preview_ready',
        driveFileId,
        name: file.name,
        pageCount: Number(current.page_count),
        pagesReady: Number(current.pages_ready),
      }));
      return;
    }
    if (current?.status === 'failed') {
      throw new Error(`Targeted preview failed for ${file.name}: ${current.last_error || 'unknown error'}`);
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for targeted preview: ${file.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

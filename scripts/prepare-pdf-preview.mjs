import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const driveFileArgument = process.argv.find((value) => value.startsWith('--drive-file-id='));
const driveFileId = driveFileArgument?.slice('--drive-file-id='.length).trim() || '';
if (!driveFileId) throw new Error('Usage: node scripts/prepare-pdf-preview.mjs --drive-file-id=<Google Drive file ID> [--storage-provider=r2|supabase]');

const providerArgument = process.argv.find((value) => value.startsWith('--storage-provider='));
const requestedProvider = (providerArgument?.slice('--storage-provider='.length) || process.env.PDF_PREVIEW_STORAGE_PROVIDER || 'supabase').trim().toLowerCase();
if (!['supabase', 'r2'].includes(requestedProvider)) throw new Error('Storage provider must be supabase or r2');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeModifiedTime(value) {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().replace(/Z$/, '+00:00') : trimmed;
}

function versionKey(file) {
  return createHash('sha256')
    .update(`${file.drive_file_id}\n${normalizeModifiedTime(file.modified_at)}\n${file.size_bytes}`)
    .digest('hex');
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal ?? 'unknown status'}`));
    });
  });
}

async function indexedResource() {
  const { data, error } = await supabase
    .from('dp_resource_index')
    .select('drive_file_id,name,size_bytes,modified_at')
    .eq('drive_file_id', driveFileId)
    .eq('is_folder', false)
    .eq('mime_type', 'application/pdf')
    .maybeSingle();
  if (error) throw new Error(`Unable to read the targeted PDF resource: ${error.message}`);
  if (!data) throw new Error(`No indexed PDF was found for Drive file ID ${driveFileId}`);
  return { ...data, size_bytes: Number(data.size_bytes) };
}

async function targetDocument(version) {
  const { data, error } = await supabase
    .from('dp_pdf_preview_documents')
    .select('*')
    .eq('drive_file_id', driveFileId)
    .eq('version_key', version)
    .maybeSingle();
  if (error) throw new Error(`Unable to read the targeted preview document: ${error.message}`);
  return data || null;
}

async function main() {
  const resource = await indexedResource();
  const version = versionKey(resource);
  console.log(JSON.stringify({ event: 'pdf_preview_manual_prepare_started', driveFileId, version, requestedProvider }));

  await run(process.execPath, [
    'scripts/queue-pdf-previews.mjs',
    `--drive-file-id=${driveFileId}`,
    `--storage-provider=${requestedProvider}`,
  ]);

  const document = await targetDocument(version);
  if (!document) throw new Error(`Queueing did not create preview version ${version} for ${driveFileId}`);
  if (
    document.status === 'ready'
    && Number(document.pages_ready) === Number(document.page_count)
    && Boolean(document.text_ready_at)
  ) {
    console.log(JSON.stringify({
      event: 'pdf_preview_manual_prepare_already_ready',
      driveFileId,
      pageCount: document.page_count,
      searchReady: true,
      storageProvider: document.storage_provider,
      storageBucket: document.storage_bucket,
    }));
    return;
  }

  // Render Free has no separate background worker. Put this exact document at the
  // front of the existing atomic queue, then run the worker for exactly one job.
  // A fully rendered document with no text index is reopened only to extract text;
  // its existing page images remain untouched and are skipped by the resumable worker.
  const priorityTime = '1970-01-01T00:00:00.000Z';
  const { error: priorityError } = await supabase
    .from('dp_pdf_preview_documents')
    .update({
      status: Number(document.pages_ready) > 0 ? 'partial' : 'processing',
      attempts: 0,
      locked_by: null,
      lock_expires_at: priorityTime,
      queued_at: priorityTime,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', document.id);
  if (priorityError) throw new Error(`Unable to prioritize the targeted preview job: ${priorityError.message}`);

  const provider = document.storage_provider || 'supabase';
  const worker = provider === 'r2' ? 'scripts/pdf-preview-worker-r2.mjs' : 'scripts/pdf-preview-worker.mjs';
  await run(process.execPath, [worker, '--once'], { PDF_PREVIEW_STORAGE_PROVIDER: provider });

  const completed = await targetDocument(version);
  if (!completed || completed.id !== document.id) {
    throw new Error('The targeted preview document changed while it was being prepared');
  }
  if (completed.status !== 'ready' || Number(completed.pages_ready) !== Number(completed.page_count)) {
    throw new Error(`Preview preparation did not finish: status=${completed.status}, pages=${completed.pages_ready}/${completed.page_count}`);
  }

  console.log(JSON.stringify({
    event: 'pdf_preview_manual_prepare_ready',
    driveFileId,
    pageCount: completed.page_count,
    pagesReady: completed.pages_ready,
    searchReady: Boolean(completed.text_ready_at),
    storageProvider: completed.storage_provider,
    storageBucket: completed.storage_bucket,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

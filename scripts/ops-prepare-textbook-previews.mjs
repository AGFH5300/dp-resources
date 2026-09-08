import { createHash } from 'node:crypto';
import { readFile, appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const STATE_FILE = '.ops-textbook-library-state.json';
const MAX_TOTAL_PREVIEW_GIB = Number(process.env.MAX_TOTAL_PREVIEW_GIB || '8');
const R2_BUCKET = process.env.R2_PDF_PREVIEW_BUCKET?.trim() || '';

for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PDF_PREVIEW_BUCKET',
]) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
if (!Number.isFinite(MAX_TOTAL_PREVIEW_GIB) || MAX_TOTAL_PREVIEW_GIB <= 0) {
  throw new Error('MAX_TOTAL_PREVIEW_GIB must be greater than zero');
}

const maximumStorageBytes = Math.floor(MAX_TOTAL_PREVIEW_GIB * 1024 * 1024 * 1024);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

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

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal ?? 'unknown status'}`));
    });
  });
}

async function storageUsage() {
  const { data, error } = await supabase.rpc('dp_pdf_preview_storage_usage', {
    p_storage_provider: 'r2',
  });
  if (error) throw new Error(`Unable to read R2 preview storage usage: ${error.message}`);
  return Number(data || 0);
}

async function documentUsage(documentId) {
  const { data, error } = await supabase.rpc('dp_pdf_preview_document_storage_usage', {
    p_document_id: documentId,
  });
  if (error) throw new Error(`Unable to read preview document storage usage: ${error.message}`);
  return Number(data || 0);
}

async function indexedPdf(driveFileId) {
  const { data, error } = await supabase
    .from('dp_resource_index')
    .select('drive_file_id,name,size_bytes,modified_at,mime_type,parent_drive_file_id')
    .eq('drive_file_id', driveFileId)
    .eq('is_folder', false)
    .eq('mime_type', 'application/pdf')
    .maybeSingle();
  if (error) throw new Error(`Unable to read indexed PDF ${driveFileId}: ${error.message}`);
  if (!data) throw new Error(`Indexed PDF missing for preview target ${driveFileId}`);
  return { ...data, size_bytes: Number(data.size_bytes) };
}

async function exactPreviewDocument(file) {
  const version = versionKey(file);
  const { data, error } = await supabase
    .from('dp_pdf_preview_documents')
    .select('id,drive_file_id,source_name,version_key,status,page_count,pages_ready,text_ready_at,search_geometry_ready_at,storage_provider,storage_bucket,storage_prefix,last_error')
    .eq('drive_file_id', file.drive_file_id)
    .eq('version_key', version)
    .maybeSingle();
  if (error) throw new Error(`Unable to read preview document for ${file.name}: ${error.message}`);
  return data || null;
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
      document.storage_bucket === R2_BUCKET &&
      document.storage_prefix?.startsWith(`${document.drive_file_id}/`),
  );
}

function formatMiB(bytes) {
  return (Number(bytes || 0) / 1024 / 1024).toFixed(2);
}

async function verifyObsoleteRowsGone(obsoleteDriveFileIds) {
  const [{ data: indexRows, error: indexError }, { data: previews, error: previewError }] = await Promise.all([
    supabase.from('dp_resource_index').select('drive_file_id').in('drive_file_id', obsoleteDriveFileIds),
    supabase.from('dp_pdf_preview_documents').select('id,drive_file_id').in('drive_file_id', obsoleteDriveFileIds),
  ]);
  if (indexError) throw new Error(indexError.message);
  if (previewError) throw new Error(previewError.message);
  if ((indexRows || []).length || (previews || []).length) {
    throw new Error('Obsolete index or preview rows remain during final preview audit');
  }
}

async function verifyPlacementIndex(placements) {
  for (const placement of placements) {
    const { data, error } = await supabase
      .from('dp_resource_index')
      .select('drive_file_id,parent_drive_file_id,name,size_bytes,is_folder')
      .eq('drive_file_id', placement.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Placement disappeared from index: ${placement.name}`);
    if (
      data.parent_drive_file_id !== placement.parentId ||
      data.name !== placement.name ||
      Number(data.size_bytes || 0) !== placement.sizeBytes ||
      data.is_folder
    ) {
      throw new Error(`Final indexed placement mismatch: ${placement.name}`);
    }
  }
}

async function writeSummary(results, initialUsage, finalUsage) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    '## DP Resources textbook migration — final preview report',
    '',
    `- Targeted new large PDFs: **${results.length}**`,
    `- Initial recorded R2 preview usage: **${formatMiB(initialUsage)} MiB**`,
    `- Final recorded R2 preview usage: **${formatMiB(finalUsage)} MiB**`,
    `- R2 storage guard: **${MAX_TOTAL_PREVIEW_GIB} GiB**`,
    '',
    '| PDF | Result | Pages | Preview MiB |',
    '|---|---:|---:|---:|',
  ];
  for (const result of results) {
    lines.push(`| ${result.name.replaceAll('|', '\\|')} | ${result.result} | ${result.pages} | ${formatMiB(result.previewBytes)} |`);
  }
  await appendFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  if (!Array.isArray(state.previewTargets) || !Array.isArray(state.placements)) {
    throw new Error('Ops state file is missing previewTargets or placements');
  }

  await verifyObsoleteRowsGone(state.obsoleteDriveFileIds || []);
  await verifyPlacementIndex(state.placements);

  const initialUsage = await storageUsage();
  console.log(JSON.stringify({
    event: 'textbook_preview_generation_started',
    previewTargets: state.previewTargets.length,
    initialR2UsageBytes: initialUsage,
    maximumStorageBytes,
  }, null, 2));

  const results = [];
  for (let index = 0; index < state.previewTargets.length; index += 1) {
    const target = state.previewTargets[index];
    const file = await indexedPdf(target.id);
    if (file.name !== target.name || file.size_bytes !== target.sizeBytes || file.parent_drive_file_id !== target.parentId) {
      throw new Error(`Indexed preview target changed unexpectedly: ${target.name}`);
    }

    let document = await exactPreviewDocument(file);
    let result = 'already ready';
    if (!isReady(document)) {
      const beforeUsage = await storageUsage();
      if (beforeUsage >= maximumStorageBytes) {
        const remaining = state.previewTargets.slice(index).map((item) => item.name);
        throw new Error(`R2 storage guard reached before all new textbook previews were ready. Remaining: ${remaining.join(' | ')}`);
      }
      console.log(JSON.stringify({ event: 'textbook_preview_prepare_start', index: index + 1, total: state.previewTargets.length, driveFileId: file.drive_file_id, name: file.name, r2UsageBytes: beforeUsage }));
      await run(process.execPath, [
        'scripts/prepare-pdf-preview.mjs',
        `--drive-file-id=${file.drive_file_id}`,
        '--storage-provider=r2',
      ], { PDF_PREVIEW_STORAGE_PROVIDER: 'r2' });
      document = await exactPreviewDocument(file);
      result = 'prepared';
    }

    if (!isReady(document)) {
      throw new Error(`Preview is not fully ready for ${file.name}: ${JSON.stringify(document)}`);
    }
    const previewBytes = await documentUsage(document.id);
    results.push({
      driveFileId: file.drive_file_id,
      name: file.name,
      result,
      pages: Number(document.page_count),
      previewBytes,
      storagePrefix: document.storage_prefix,
    });
    console.log(JSON.stringify({ event: 'textbook_preview_verified_ready', driveFileId: file.drive_file_id, name: file.name, result, pageCount: Number(document.page_count), previewBytes }, null, 2));
  }

  await verifyObsoleteRowsGone(state.obsoleteDriveFileIds || []);
  await verifyPlacementIndex(state.placements);

  const finalUsage = await storageUsage();
  await writeSummary(results, initialUsage, finalUsage);

  console.log(JSON.stringify({
    event: 'textbook_library_finalized',
    placementsVerified: state.placements.length,
    obsoleteDriveIdsCleanedFromIndexAndPreviewState: (state.obsoleteDriveFileIds || []).length,
    largePdfPreviewsReady: results.length,
    initialR2UsageBytes: initialUsage,
    finalR2UsageBytes: finalUsage,
    maxTotalPreviewGiB: MAX_TOTAL_PREVIEW_GIB,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

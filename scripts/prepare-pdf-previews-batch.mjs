import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

function argument(name, fallback = '') {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3).trim() : fallback;
}

const selection = argument('selection', 'largest_textbooks');
const driveFileId = argument('drive-file-id');
const storageProvider = argument(
  'storage-provider',
  process.env.PDF_PREVIEW_STORAGE_PROVIDER || 'r2',
).toLowerCase();
const minSizeMiB = Number(argument('min-size-mib', '20'));
const maxBooks = Number(argument('max-books', '3'));
const maxTotalGiB = Number(
  argument('max-total-preview-gib', storageProvider === 'r2' ? '8' : '0.9'),
);

if (!['single_pdf', 'largest_textbooks', 'all_large_pdfs'].includes(selection))
  throw new Error(
    'Selection must be single_pdf, largest_textbooks or all_large_pdfs',
  );
if (selection === 'single_pdf' && !driveFileId)
  throw new Error('A Drive file ID is required for single_pdf selection');
if (!['supabase', 'r2'].includes(storageProvider))
  throw new Error('Storage provider must be supabase or r2');
if (!Number.isFinite(minSizeMiB) || minSizeMiB < 0)
  throw new Error('Minimum size must be zero or greater');
if (!Number.isSafeInteger(maxBooks) || maxBooks < 1 || maxBooks > 40)
  throw new Error('Maximum books must be between 1 and 40');
if (!Number.isFinite(maxTotalGiB) || maxTotalGiB <= 0)
  throw new Error('Maximum total preview storage must be greater than zero');

const minimumBytes = Math.floor(minSizeMiB * 1024 * 1024);
const maximumStorageBytes = Math.floor(maxTotalGiB * 1024 * 1024 * 1024);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
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
    .update(
      `${file.drive_file_id}\n${normalizeModifiedTime(file.modified_at)}\n${Number(file.size_bytes)}`,
    )
    .digest('hex');
}

function isLikelyTextbook(file) {
  const name = file.name || '';
  const excluded =
    /(^|\b)(question paper|markscheme|mark scheme|specimen paper|past paper|student notes|worksheet|mind[- ]?map)(\b|$)/i.test(
      name,
    ) ||
    /^\d{4}\s+(may|november)\b/i.test(name) ||
    /topic\s+\w*\d+.*sample/i.test(name);
  if (excluded) return false;
  const strongTextbookSignal =
    /(textbook|coursebook|course companion|study guide|revision guide|worked solutions|teacher'?s? guide|pearson|cambridge|oxford|hodder|\bibid\b|\bexpress\b|\bedition\b)/i.test(
      name,
    );
  return strongTextbookSignal || Number(file.size_bytes) >= 100 * 1024 * 1024;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} exited with ${code ?? signal ?? 'unknown status'}`,
          ),
        );
    });
  });
}

async function storageUsage(provider) {
  const { data, error } = await supabase.rpc('dp_pdf_preview_storage_usage', {
    p_storage_provider: provider,
  });
  if (error)
    throw new Error(
      `Unable to read ${provider} preview storage usage: ${error.message}`,
    );
  return Number(data || 0);
}

async function documentUsage(documentId) {
  const { data, error } = await supabase.rpc(
    'dp_pdf_preview_document_storage_usage',
    { p_document_id: documentId },
  );
  if (error)
    throw new Error(
      `Unable to read preview document storage usage: ${error.message}`,
    );
  return Number(data || 0);
}

async function targetDocument(file) {
  const { data, error } = await supabase
    .from('dp_pdf_preview_documents')
    .select('*')
    .eq('drive_file_id', file.drive_file_id)
    .eq('version_key', versionKey(file))
    .maybeSingle();
  if (error)
    throw new Error(
      `Unable to read preview state for ${file.name}: ${error.message}`,
    );
  return data || null;
}

async function loadSinglePdf() {
  const { data, error } = await supabase
    .from('dp_resource_index')
    .select('drive_file_id,name,size_bytes,modified_at')
    .eq('drive_file_id', driveFileId)
    .eq('is_folder', false)
    .eq('mime_type', 'application/pdf')
    .maybeSingle();
  if (error) throw new Error(`Unable to read selected PDF: ${error.message}`);
  if (!data)
    throw new Error(
      `No indexed PDF was found for Drive file ID ${driveFileId}`,
    );
  return [{ ...data, size_bytes: Number(data.size_bytes) }];
}

async function loadLargePdfs() {
  const files = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('dp_resource_index')
      .select('drive_file_id,name,size_bytes,modified_at')
      .eq('is_folder', false)
      .eq('mime_type', 'application/pdf')
      .gte('size_bytes', minimumBytes)
      .order('size_bytes', { ascending: false })
      .range(from, from + 499);
    if (error)
      throw new Error(`Unable to read large PDF candidates: ${error.message}`);
    if (!data?.length) break;
    for (const row of data)
      files.push({ ...row, size_bytes: Number(row.size_bytes) });
    if (data.length < 500) break;
    from += data.length;
  }
  return files;
}

async function loadLargestTextbooks() {
  return (await loadLargePdfs()).filter(isLikelyTextbook);
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function formatMiB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function writeSummary(
  results,
  skipped,
  stoppedForStorage,
  finalStorageBytes,
) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    '## PDF preview preparation report',
    '',
    `- Selection: \`${selection}\``,
    `- Storage provider: \`${storageProvider}\``,
    `- Final recorded ${storageProvider} usage: **${formatMiB(finalStorageBytes)} MiB**`,
    `- Completed searchable versions skipped: **${skipped.length}**`,
    `- Storage guard reached: **${stoppedForStorage ? 'yes' : 'no'}**`,
    '',
    '| PDF | Result | Pages | Search | Duration | Preview MiB |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  if (!results.length)
    lines.push('| No new PDF required preparation | — | — | — | — | — |');
  for (const result of results) {
    lines.push(
      `| ${escapeTable(result.name)} | ${escapeTable(result.status)} | ${result.pages ?? '—'} | ${result.searchReady ? 'Ready' : 'Unavailable'} | ${result.duration} | ${result.previewMiB ?? '—'} |`,
    );
  }
  if (skipped.length) {
    lines.push('', '### Already prepared and searchable');
    for (const file of skipped) lines.push(`- ${file.name}`);
  }
  await appendFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const files =
    selection === 'single_pdf'
      ? await loadSinglePdf()
      : selection === 'all_large_pdfs'
        ? await loadLargePdfs()
        : await loadLargestTextbooks();
  const selected = [];
  const skipped = [];
  for (const file of files) {
    const existing = await targetDocument(file);
    if (
      existing?.status === 'ready' &&
      Number(existing.pages_ready) === Number(existing.page_count) &&
      Boolean(existing.text_ready_at) &&
      Boolean(existing.search_geometry_ready_at)
    ) {
      skipped.push(file);
      if (selection === 'single_pdf') break;
      continue;
    }
    selected.push(file);
    if (selected.length >= maxBooks) break;
  }

  console.log(
    JSON.stringify({
      event: 'pdf_preview_batch_selected',
      selection,
      storageProvider,
      minimumBytes,
      maxBooks,
      selected: selected.map((file) => ({
        fileId: file.drive_file_id,
        name: file.name,
        sizeBytes: file.size_bytes,
      })),
      skippedReady: skipped.length,
    }),
  );

  const results = [];
  let stoppedForStorage = false;
  for (const file of selected) {
    const beforeUsage = await storageUsage(storageProvider);
    if (beforeUsage >= maximumStorageBytes) {
      stoppedForStorage = true;
      console.warn(
        JSON.stringify({
          event: 'pdf_preview_batch_storage_limit_reached',
          storageProvider,
          usageBytes: beforeUsage,
          maximumStorageBytes,
        }),
      );
      break;
    }

    const startedAt = Date.now();
    let status = 'ready';
    let message = null;
    try {
      await run(process.execPath, [
        'scripts/prepare-pdf-preview.mjs',
        `--drive-file-id=${file.drive_file_id}`,
        `--storage-provider=${storageProvider}`,
      ]);
    } catch (error) {
      status = 'failed';
      message = error instanceof Error ? error.message : String(error);
    }

    const document = await targetDocument(file);
    const bytes = document ? await documentUsage(document.id) : 0;
    const result = {
      fileId: file.drive_file_id,
      name: file.name,
      status,
      message,
      pages: document?.page_count || null,
      pagesReady: document?.pages_ready || 0,
      searchReady: Boolean(
        document?.text_ready_at && document?.search_geometry_ready_at,
      ),
      duration: formatDuration(Date.now() - startedAt),
      previewMiB: formatMiB(bytes),
      storageProvider: document?.storage_provider || storageProvider,
    };
    results.push(result);
    console.log(
      JSON.stringify({ event: 'pdf_preview_batch_result', ...result }),
    );
  }

  const finalStorageBytes = await storageUsage(storageProvider);
  await writeSummary(results, skipped, stoppedForStorage, finalStorageBytes);
  if (results.some((result) => result.status === 'failed'))
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

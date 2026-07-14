import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const execFile = promisify(execFileCallback);
const BUCKET = 'pdf-previews';
const RENDER_DPI = Number(process.env.PDF_PREVIEW_DPI || 150);
const JPEG_QUALITY = Number(process.env.PDF_PREVIEW_JPEG_QUALITY || 76);
const BATCH_SIZE = Number(process.env.PDF_PREVIEW_BATCH_SIZE || 40);
const UPLOAD_CONCURRENCY = Number(process.env.PDF_PREVIEW_UPLOAD_CONCURRENCY || 6);
const UPLOAD_ATTEMPTS = Number(process.env.PDF_PREVIEW_UPLOAD_ATTEMPTS || 5);
const POLL_MS = Number(process.env.PDF_PREVIEW_POLL_MS || 5000);
const once = process.argv.includes('--once');
const workerId = process.env.PDF_PREVIEW_WORKER_ID || `pdf-worker-${randomUUID()}`;

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
if (!Number.isFinite(RENDER_DPI) || RENDER_DPI < 96 || RENDER_DPI > 240) throw new Error('PDF_PREVIEW_DPI must be between 96 and 240');
if (!Number.isFinite(JPEG_QUALITY) || JPEG_QUALITY < 50 || JPEG_QUALITY > 95) throw new Error('PDF_PREVIEW_JPEG_QUALITY must be between 50 and 95');
if (!Number.isSafeInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 100) throw new Error('PDF_PREVIEW_BATCH_SIZE must be between 1 and 100');
if (!Number.isSafeInteger(UPLOAD_CONCURRENCY) || UPLOAD_CONCURRENCY < 1 || UPLOAD_CONCURRENCY > 12) throw new Error('PDF_PREVIEW_UPLOAD_CONCURRENCY must be between 1 and 12');
if (!Number.isSafeInteger(UPLOAD_ATTEMPTS) || UPLOAD_ATTEMPTS < 1 || UPLOAD_ATTEMPTS > 8) throw new Error('PDF_PREVIEW_UPLOAD_ATTEMPTS must be between 1 and 8');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function errorDetails(error) {
  if (!error) return 'unknown error';
  const details = [error.message || String(error)];
  if (error.statusCode) details.push(`status=${error.statusCode}`);
  if (error.error && error.error !== error.message) details.push(String(error.error));
  return details.join(' ');
}

function shouldRetryUpload(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = errorDetails(error).toLowerCase();
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500
    || /aborted|timeout|timed out|network|fetch|socket|bad request/.test(message);
}

async function withUploadRetry(pageNumber, operation) {
  let lastError = null;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    let result;
    try {
      result = await operation();
    } catch (error) {
      result = { error };
    }
    if (!result.error) return result;
    lastError = result.error;
    if (attempt >= UPLOAD_ATTEMPTS || !shouldRetryUpload(lastError)) break;
    const delayMs = Math.min(8000, 400 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 250);
    console.warn(JSON.stringify({
      event: 'pdf_preview_upload_retry',
      pageNumber,
      attempt,
      delayMs,
      message: errorDetails(lastError),
    }));
    await sleep(delayMs);
  }
  throw new Error(`Unable to upload PDF page ${pageNumber}: ${errorDetails(lastError)}`);
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function claimJob() {
  const { data, error } = await supabase.rpc('dp_claim_pdf_preview_job', { p_worker_id: workerId });
  if (error) throw new Error(`Unable to claim PDF preview job: ${error.message}`);
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function downloadSource(job, destination) {
  const response = await drive.files.get({
    fileId: job.drive_file_id,
    alt: 'media',
    supportsAllDrives: true,
  }, { responseType: 'stream' });
  await pipeline(response.data, createWriteStream(destination));
  const details = await stat(destination);
  if (Number(details.size) !== Number(job.source_size_bytes)) {
    throw new Error(`Drive PDF size changed during preparation (${details.size} != ${job.source_size_bytes})`);
  }
}

function parsePdfInfo(output) {
  const pageCount = Number(/^Pages:\s+(\d+)$/m.exec(output)?.[1]);
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('pdfinfo did not return a valid page count');
  const dimensions = new Map();
  const pattern = /^Page\s+(\d+)\s+size:\s+([\d.]+) x ([\d.]+) pts$/gm;
  for (const match of output.matchAll(pattern)) {
    dimensions.set(Number(match[1]), { widthPoints: Number(match[2]), heightPoints: Number(match[3]) });
  }
  if (dimensions.size !== pageCount) throw new Error(`pdfinfo returned dimensions for ${dimensions.size} of ${pageCount} pages`);
  return { pageCount, dimensions };
}

async function readPdfInfo(sourcePath) {
  const { stdout } = await execFile('pdfinfo', ['-box', '-f', '1', '-l', '999999', sourcePath], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return parsePdfInfo(stdout);
}

async function upsertPageDimensions(job, pageCount, dimensions) {
  const rows = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = dimensions.get(pageNumber);
    rows.push({
      document_id: job.id,
      page_number: pageNumber,
      width_points: page.widthPoints,
      height_points: page.heightPoints,
      pixel_width: Math.max(1, Math.round((page.widthPoints * RENDER_DPI) / 72)),
      pixel_height: Math.max(1, Math.round((page.heightPoints * RENDER_DPI) / 72)),
      updated_at: new Date().toISOString(),
    });
  }
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await supabase.from('dp_pdf_preview_pages').upsert(rows.slice(offset, offset + 500), {
      onConflict: 'document_id,page_number',
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Unable to save PDF page dimensions: ${error.message}`);
  }
  const { error } = await supabase.from('dp_pdf_preview_documents').update({
    page_count: pageCount,
    lock_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id);
  if (error) throw new Error(`Unable to save PDF page count: ${error.message}`);
}

async function existingReadyPages(jobId) {
  const ready = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('dp_pdf_preview_pages')
      .select('page_number')
      .eq('document_id', jobId)
      .not('ready_at', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(`Unable to read prepared PDF pages: ${error.message}`);
    for (const row of data || []) ready.add(row.page_number);
    if (!data || data.length < 1000) break;
    from += data.length;
  }
  return ready;
}

async function renderRange(sourcePath, outputDir, start, end) {
  const prefix = join(outputDir, `render-${start}-${end}`);
  const args = [
    '-f', String(start),
    '-l', String(end),
    '-jpeg',
    '-r', String(RENDER_DPI),
    '-jpegopt', `quality=${JPEG_QUALITY},progressive=y,optimize=y`,
    sourcePath,
    prefix,
  ];
  await execFile('pdftoppm', args, { maxBuffer: 16 * 1024 * 1024 });
  const files = (await readdir(outputDir))
    .filter((file) => file.startsWith(basename(prefix)) && file.endsWith('.jpg'))
    .sort();
  if (files.length !== end - start + 1) throw new Error(`Rendered ${files.length} of ${end - start + 1} requested pages`);
  return files.map((file, index) => ({ pageNumber: start + index, path: join(outputDir, file) }));
}

async function uploadRenderedBatch(job, dimensions, rendered) {
  if (!rendered.length) return [];
  const readyAt = new Date().toISOString();
  const rows = await mapConcurrent(rendered, UPLOAD_CONCURRENCY, async ({ pageNumber, path }) => {
    const bytes = await readFile(path);
    const objectPath = `${job.storage_prefix}/page-${pageNumber}.jpg`;
    await withUploadRetry(pageNumber, () => supabase.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    }));
    const page = dimensions.get(pageNumber);
    return {
      document_id: job.id,
      page_number: pageNumber,
      width_points: page.widthPoints,
      height_points: page.heightPoints,
      pixel_width: Math.max(1, Math.round((page.widthPoints * RENDER_DPI) / 72)),
      pixel_height: Math.max(1, Math.round((page.heightPoints * RENDER_DPI) / 72)),
      object_path: objectPath,
      byte_size: bytes.length,
      etag: sha256(bytes),
      ready_at: readyAt,
      updated_at: readyAt,
    };
  });

  const { error } = await supabase.from('dp_pdf_preview_pages').upsert(rows, {
    onConflict: 'document_id,page_number',
  });
  if (error) throw new Error(`Unable to record PDF page batch: ${error.message}`);
  await Promise.all(rendered.map((item) => rm(item.path, { force: true })));
  return rows;
}

async function updateProgress(job, pageCount, pagesReady) {
  const now = new Date().toISOString();
  const complete = pagesReady >= pageCount;
  const { error } = await supabase.from('dp_pdf_preview_documents').update({
    status: complete ? 'ready' : pagesReady > 0 ? 'partial' : 'processing',
    pages_ready: pagesReady,
    first_page_ready_at: pagesReady > 0 ? job.first_page_ready_at || now : null,
    completed_at: complete ? now : null,
    locked_by: complete ? null : workerId,
    lock_expires_at: complete ? null : new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    updated_at: now,
  }).eq('id', job.id);
  if (error) throw new Error(`Unable to update PDF preview progress: ${error.message}`);
}

async function processJob(job) {
  const workDir = await mkdtemp(join(tmpdir(), 'dp-pdf-preview-'));
  const sourcePath = join(workDir, 'source.pdf');
  const outputDir = join(workDir, 'pages');
  await mkdir(outputDir);

  try {
    console.log(JSON.stringify({ event: 'pdf_preview_started', workerId, fileId: job.drive_file_id, version: job.version_key }));
    await downloadSource(job, sourcePath);
    const { pageCount, dimensions } = await readPdfInfo(sourcePath);
    await upsertPageDimensions(job, pageCount, dimensions);
    const readyPages = await existingReadyPages(job.id);
    console.log(JSON.stringify({ event: 'pdf_preview_resume_state', fileId: job.drive_file_id, pagesReady: readyPages.size, pageCount }));

    const ranges = [];
    if (!readyPages.has(1)) ranges.push([1, 1]);
    for (let start = 2; start <= pageCount; start += BATCH_SIZE) {
      const end = Math.min(pageCount, start + BATCH_SIZE - 1);
      if ([...Array(end - start + 1)].every((_, index) => readyPages.has(start + index))) continue;
      ranges.push([start, end]);
    }

    for (const [start, end] of ranges) {
      const rendered = await renderRange(sourcePath, outputDir, start, end);
      const pending = rendered.filter((item) => !readyPages.has(item.pageNumber));
      const uploaded = await uploadRenderedBatch(job, dimensions, pending);
      for (const row of uploaded) readyPages.add(row.page_number);
      for (const item of rendered) {
        if (!pending.some((pendingItem) => pendingItem.path === item.path)) await rm(item.path, { force: true });
      }
      await updateProgress(job, pageCount, readyPages.size);
      console.log(JSON.stringify({ event: 'pdf_preview_progress', fileId: job.drive_file_id, pagesReady: readyPages.size, pageCount }));
    }

    if (readyPages.size >= pageCount) await updateProgress(job, pageCount, readyPages.size);
    console.log(JSON.stringify({ event: 'pdf_preview_ready', fileId: job.drive_file_id, pageCount }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: 'pdf_preview_failed', fileId: job.drive_file_id, message }));
    const { count } = await supabase
      .from('dp_pdf_preview_pages')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', job.id)
      .not('ready_at', 'is', null);
    const pagesReady = count || 0;
    await supabase.from('dp_pdf_preview_documents').update({
      status: pagesReady > 0 ? 'partial' : 'failed',
      pages_ready: pagesReady,
      last_error: message.slice(0, 1000),
      locked_by: null,
      lock_expires_at: pagesReady > 0 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(JSON.stringify({
    event: 'pdf_preview_worker_started',
    workerId,
    dpi: RENDER_DPI,
    batchSize: BATCH_SIZE,
    uploadConcurrency: UPLOAD_CONCURRENCY,
    uploadAttempts: UPLOAD_ATTEMPTS,
  }));
  do {
    const job = await claimJob();
    if (job) await processJob(job);
    else if (!once) await sleep(POLL_MS);
  } while (!once);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

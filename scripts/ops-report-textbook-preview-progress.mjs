import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','R2_PDF_PREVIEW_BUCKET']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const TARGET_IDS = [
  '1yPcQtlrxQqIB1eBUoe8yz9cHMJ5dwue3','1EsEHNoW7IsS70bIwcWIwKtMuneQrMuxF','1iHOC5wskXDe8aPpseo7joSFZtes6IZbS','1zNlcdPwAZKKUvwxz1FR2j-lCgVki0Tcn','1a1cwAxfQMA0Gm8wB4TMJoeFKC6uv85qG','1KIGMQWVWHo1DzWkurjFp_CBfPYB2SOhk','1p6mE34c-SLFZEkekTdqy9YnDY5w8fuOz','1J7RxN8-smkfXz6RIR51xyn0FsGClTk_i','1JT1GMjC8HttyMqQUMSamaldoUrtgeqvH','1OxSX2EagTVeqIzh-ERlBHX_nkjmaaJPB','1_assUG83WscRm-YEgEMAoIrAcRnkgZWS','1GMB0hhTlF4tPs40ZlEE26AfmJ0BcNUKL','1otdVajJ1WPETklHLHzshXfXjdsLWHGkx','1s25O-RPlnDZVQUPRdufjkrCj7HKpaypH','1ZfMPhY6sQ2Rtp92c-TYUqQZiSMPjOqUO','1rhwWSsCoy5BGVaeXes0xYDSHcWS7Ti8y','1Wax4eNY6WF2tI_xgF2FDXM1qS2GxHBD2','1F4e5pnRQT1W-m5VE4dHjwFB834PDx-Xh','1WCSn7IeHpG6xXlmglE67Exo7mdcq_gAj','19LBb9bBFyjppLPeUYap0YIU7fxmmefSp','19p4gieYDGIgsSYf4UCwhrbqEy7dqMJNC'
];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeModifiedTime(value) {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().replace(/Z$/, '+00:00') : trimmed;
}
function versionKey(file) {
  return createHash('sha256').update(`${file.drive_file_id}\n${normalizeModifiedTime(file.modified_at)}\n${Number(file.size_bytes)}`).digest('hex');
}

async function retry(label, fn) {
  let last;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const result = await fn();
      if (!result.error) return result;
      last = result.error;
    } catch (error) {
      last = error;
    }
    if (attempt < 6) await sleep(1000 * attempt);
  }
  throw new Error(`${label}: ${last?.message || String(last)}`);
}

const indexResult = await retry('index query', () => supabase
  .from('dp_resource_index')
  .select('drive_file_id,name,size_bytes,modified_at')
  .in('drive_file_id', TARGET_IDS));
const files = (indexResult.data || []).map((x) => ({ ...x, size_bytes: Number(x.size_bytes) })).sort((a,b) => b.size_bytes-a.size_bytes);

const docsResult = await retry('preview query', () => supabase
  .from('dp_pdf_preview_documents')
  .select('id,drive_file_id,version_key,status,page_count,pages_ready,text_ready_at,search_geometry_ready_at,storage_provider,storage_bucket,storage_prefix,last_error,started_at,completed_at,updated_at,locked_by,lock_expires_at')
  .in('drive_file_id', TARGET_IDS));
const byExact = new Map((docsResult.data || []).map((d) => [`${d.drive_file_id}:${d.version_key}`, d]));

const rows = files.map((file, index) => {
  const doc = byExact.get(`${file.drive_file_id}:${versionKey(file)}`) || null;
  const pageCount = Number(doc?.page_count || 0);
  const pagesReady = Number(doc?.pages_ready || 0);
  const ready = Boolean(doc && doc.status === 'ready' && pageCount > 0 && pagesReady === pageCount && doc.text_ready_at && doc.search_geometry_ready_at && doc.storage_provider === 'r2' && doc.storage_bucket === process.env.R2_PDF_PREVIEW_BUCKET);
  return {
    shard: index % 4,
    driveFileId: file.drive_file_id,
    name: file.name,
    sizeMiB: +(file.size_bytes / 1024 / 1024).toFixed(1),
    status: doc?.status || 'missing',
    pagesReady,
    pageCount,
    pagePercent: pageCount ? +((pagesReady / pageCount) * 100).toFixed(1) : 0,
    textReady: Boolean(doc?.text_ready_at && doc?.search_geometry_ready_at),
    ready,
    startedAt: doc?.started_at || null,
    completedAt: doc?.completed_at || null,
    updatedAt: doc?.updated_at || null,
    locked: Boolean(doc?.locked_by),
    lastError: doc?.last_error || null,
  };
});

const shardSummary = [0,1,2,3].map((shard) => {
  const r = rows.filter((x) => x.shard === shard);
  return {
    shard,
    books: r.length,
    readyBooks: r.filter((x) => x.ready).length,
    activeOrPartialBooks: r.filter((x) => !x.ready && ['processing','partial'].includes(x.status)).length,
    notStartedBooks: r.filter((x) => !x.ready && ['missing','queued'].includes(x.status)).length,
    knownPagesReady: r.reduce((s,x) => s+x.pagesReady,0),
    knownPageCount: r.reduce((s,x) => s+x.pageCount,0),
  };
});

const aggregate = {
  generatedAt: new Date().toISOString(),
  targetBooks: rows.length,
  readyBooks: rows.filter((x) => x.ready).length,
  partialOrProcessingBooks: rows.filter((x) => !x.ready && ['processing','partial'].includes(x.status)).length,
  missingOrQueuedBooks: rows.filter((x) => !x.ready && ['missing','queued'].includes(x.status)).length,
  failedBooks: rows.filter((x) => x.status === 'failed').length,
  knownPagesReady: rows.reduce((s,x) => s+x.pagesReady,0),
  knownPageCount: rows.reduce((s,x) => s+x.pageCount,0),
};

console.log(JSON.stringify({ event: 'textbook_preview_progress_report', aggregate, shardSummary, rows }, null, 2));
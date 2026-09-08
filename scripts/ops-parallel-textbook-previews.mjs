import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_PDF_PREVIEW_BUCKET']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const modeArg = process.argv.find((value) => value.startsWith('--mode='));
const mode = modeArg?.slice('--mode='.length) || '';
const shardIndex = Number(process.argv.find((value) => value.startsWith('--shard-index='))?.split('=')[1] || 0);
const shardCount = Number(process.argv.find((value) => value.startsWith('--shard-count='))?.split('=')[1] || 1);
const maxTotalPreviewGiB = Number(process.env.MAX_TOTAL_PREVIEW_GIB || '8');
const maximumStorageBytes = Math.floor(maxTotalPreviewGiB * 1024 * 1024 * 1024);

if (!['wait-index', 'shard', 'audit'].includes(mode)) {
  throw new Error('Mode must be wait-index, shard, or audit');
}
if (!Number.isSafeInteger(shardIndex) || !Number.isSafeInteger(shardCount) || shardIndex < 0 || shardCount < 1 || shardIndex >= shardCount) {
  throw new Error('Invalid shard index/count');
}

const TARGET_IDS = [
  '1yPcQtlrxQqIB1eBUoe8yz9cHMJ5dwue3',
  '1EsEHNoW7IsS70bIwcWIwKtMuneQrMuxF',
  '1iHOC5wskXDe8aPpseo7joSFZtes6IZbS',
  '1zNlcdPwAZKKUvwxz1FR2j-lCgVki0Tcn',
  '1a1cwAxfQMA0Gm8wB4TMJoeFKC6uv85qG',
  '1KIGMQWVWHo1DzWkurjFp_CBfPYB2SOhk',
  '1p6mE34c-SLFZEkekTdqy9YnDY5w8fuOz',
  '1J7RxN8-smkfXz6RIR51xyn0FsGClTk_i',
  '1JT1GMjC8HttyMqQUMSamaldoUrtgeqvH',
  '1OxSX2EagTVeqIzh-ERlBHX_nkjmaaJPB',
  '1_assUG83WscRm-YEgEMAoIrAcRnkgZWS',
  '1GMB0hhTlF4tPs40ZlEE26AfmJ0BcNUKL',
  '1otdVajJ1WPETklHLHzshXfXjdsLWHGkx',
  '1s25O-RPlnDZVQUPRdufjkrCj7HKpaypH',
  '1ZfMPhY6sQ2Rtp92c-TYUqQZiSMPjOqUO',
  '1rhwWSsCoy5BGVaeXes0xYDSHcWS7Ti8y',
  '1Wax4eNY6WF2tI_xgF2FDXM1qS2GxHBD2',
  '1F4e5pnRQT1W-m5VE4dHjwFB834PDx-Xh',
  '1WCSn7IeHpG6xXlmglE67Exo7mdcq_gAj',
  '19LBb9bBFyjppLPeUYap0YIU7fxmmefSp',
  '19p4gieYDGIgsSYf4UCwhrbqEy7dqMJNC',
];

const PLACEMENT_IDS = [
  '19Fc-FWAcTK_48yIC5xa7Q6miJ-RnkMkW',
  '1Q55I2Lwbcwkp7dQv_CQwr02A2zb93jlm',
  '1gVx_kuRE9xWQzVahuhWCpp7hVu1vfBLD',
  '1XXzW48aalvQP06ifkUtfB5BTRnVCuitM',
  '1rmCaIIn125xQ04RNm0Itpt8lHsKmUI15',
  '1yPcQtlrxQqIB1eBUoe8yz9cHMJ5dwue3',
  '1G7cnpAeBe7ynxLwZLmZRhvUTBsiZMneq',
  '1EsEHNoW7IsS70bIwcWIwKtMuneQrMuxF',
  '1VeUaqyahEFRLZqWNUYcDfAlQRdXP2A0s',
  '1iHOC5wskXDe8aPpseo7joSFZtes6IZbS',
  '1GU-doqp15WHND1Jt1W1BIIwHzhCQ_dmK',
  '1zNlcdPwAZKKUvwxz1FR2j-lCgVki0Tcn',
  '1a1cwAxfQMA0Gm8wB4TMJoeFKC6uv85qG',
  '1KIGMQWVWHo1DzWkurjFp_CBfPYB2SOhk',
  '1p6mE34c-SLFZEkekTdqy9YnDY5w8fuOz',
  '1J7RxN8-smkfXz6RIR51xyn0FsGClTk_i',
  '1JT1GMjC8HttyMqQUMSamaldoUrtgeqvH',
  '1OxSX2EagTVeqIzh-ERlBHX_nkjmaaJPB',
  '1_assUG83WscRm-YEgEMAoIrAcRnkgZWS',
  '1GMB0hhTlF4tPs40ZlEE26AfmJ0BcNUKL',
  '1otdVajJ1WPETklHLHzshXfXjdsLWHGkx',
  '1s25O-RPlnDZVQUPRdufjkrCj7HKpaypH',
  '1ZfMPhY6sQ2Rtp92c-TYUqQZiSMPjOqUO',
  '1rhwWSsCoy5BGVaeXes0xYDSHcWS7Ti8y',
  '1Wax4eNY6WF2tI_xgF2FDXM1qS2GxHBD2',
  '1F4e5pnRQT1W-m5VE4dHjwFB834PDx-Xh',
  '1WCSn7IeHpG6xXlmglE67Exo7mdcq_gAj',
  '19LBb9bBFyjppLPeUYap0YIU7fxmmefSp',
  '19p4gieYDGIgsSYf4UCwhrbqEy7dqMJNC',
];

const OBSOLETE_IDS = [
  '11NyoTU_hVzLZEu6x-Q4KvucKcirJgxpn',
  '1N9hPrW8Gre7oj_lYMRbsrOqweYgocg9v',
  '10MA8BA8-MrMygcXh9BS-oYVkt_Rvn4eh',
  '1JsFX_Ni8wbY5NvJqOMHsULUQxpACNUKc',
  '1gdI30F1OyqbEPWkTFpn-7mpehzevwSfi',
  '1tMGjL4C-zhXmpZ6YvlMwCIVwQxv1TSkD',
  '1HorkEuB2SOn59vQuXfbQf-QYgizPevpt',
  '1GpptOGvmKXyXv6xXzKqTUA9GbajBOmnz',
  '1aKX4BXU8uPmw9smbAIuLiJuTi2tZ5-JZ',
  '1GRfNeUS-hNV7CiBF_Gm1vN40eWaJvQem',
  '13mPctJR96CfHFGSo5x7DlVUQsJ26co5c',
  '1IPzXSMSJSape5GGzMbsC8XmlOwazfL4Y',
];

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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal ?? 'unknown status'}`));
    });
  });
}

async function loadIndexedTargets() {
  const { data, error } = await supabase
    .from('dp_resource_index')
    .select('drive_file_id,name,size_bytes,modified_at,mime_type,is_folder')
    .in('drive_file_id', TARGET_IDS);
  if (error) throw new Error(error.message);
  const byId = new Map((data || []).map((row) => [row.drive_file_id, { ...row, size_bytes: Number(row.size_bytes) }]));
  const missing = TARGET_IDS.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`Preview targets missing from index: ${missing.join(', ')}`);
  const files = TARGET_IDS.map((id) => byId.get(id));
  for (const file of files) {
    if (file.is_folder || file.mime_type !== 'application/pdf' || file.size_bytes < 20 * 1024 * 1024) {
      throw new Error(`Invalid large-PDF preview target: ${file.name} (${file.drive_file_id})`);
    }
  }
  return files;
}

async function exactDocuments(files) {
  const { data, error } = await supabase
    .from('dp_pdf_preview_documents')
    .select('id,drive_file_id,version_key,status,page_count,pages_ready,text_ready_at,search_geometry_ready_at,storage_provider,storage_bucket,storage_prefix,last_error')
    .in('drive_file_id', TARGET_IDS);
  if (error) throw new Error(error.message);
  const byKey = new Map((data || []).map((row) => [`${row.drive_file_id}:${row.version_key}`, row]));
  return files.map((file) => ({ file, document: byKey.get(`${file.drive_file_id}:${versionKey(file)}`) || null }));
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
      document.storage_bucket === process.env.R2_PDF_PREVIEW_BUCKET &&
      document.storage_prefix?.startsWith(`${document.drive_file_id}/`),
  );
}

async function storageUsage() {
  const { data, error } = await supabase.rpc('dp_pdf_preview_storage_usage', {
    p_storage_provider: 'r2',
  });
  if (error) throw new Error(`Unable to read R2 preview usage: ${error.message}`);
  return Number(data || 0);
}

async function verifyIndexAndObsoleteState() {
  const [{ data: placements, error: placementError }, { data: oldIndex, error: oldIndexError }, { data: oldPreview, error: oldPreviewError }] = await Promise.all([
    supabase.from('dp_resource_index').select('drive_file_id').in('drive_file_id', PLACEMENT_IDS),
    supabase.from('dp_resource_index').select('drive_file_id').in('drive_file_id', OBSOLETE_IDS),
    supabase.from('dp_pdf_preview_documents').select('drive_file_id').in('drive_file_id', OBSOLETE_IDS),
  ]);
  if (placementError || oldIndexError || oldPreviewError) {
    throw new Error(placementError?.message || oldIndexError?.message || oldPreviewError?.message);
  }
  const placementSet = new Set((placements || []).map((row) => row.drive_file_id));
  const missing = PLACEMENT_IDS.filter((id) => !placementSet.has(id));
  if (missing.length) throw new Error(`Expected Drive placements missing from index: ${missing.join(', ')}`);
  if ((oldIndex || []).length) throw new Error(`Obsolete resource index rows remain: ${oldIndex.map((x) => x.drive_file_id).join(', ')}`);
  if ((oldPreview || []).length) throw new Error(`Obsolete preview rows remain: ${oldPreview.map((x) => x.drive_file_id).join(', ')}`);
}

async function waitIndex() {
  const deadline = Date.now() + 45 * 60 * 1000;
  while (Date.now() < deadline) {
    const { data: state, error } = await supabase
      .from('dp_resource_index_sync_state')
      .select('status,phase,lock_token,lock_expires_at,completed_at,error_message,indexed_resources,indexed_files,indexed_folders')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();
    if (error) throw new Error(error.message);
    console.log(JSON.stringify({ event: 'parallel_preview_wait_index', state }));
    if (state?.status === 'failed') throw new Error(`Index refresh failed: ${state.error_message || 'unknown error'}`);
    if (state?.status === 'complete' && !state.lock_token) {
      await verifyIndexAndObsoleteState();
      console.log(JSON.stringify({ event: 'parallel_preview_index_ready', state }));
      return;
    }
    await sleep(5000);
  }
  throw new Error('Timed out waiting for the textbook index refresh to complete');
}

async function runShard() {
  const files = (await loadIndexedTargets()).sort((a, b) => b.size_bytes - a.size_bytes);
  const assigned = files.filter((_, index) => index % shardCount === shardIndex);
  console.log(JSON.stringify({
    event: 'parallel_preview_shard_started',
    shardIndex,
    shardCount,
    assigned: assigned.map((file) => ({ id: file.drive_file_id, name: file.name, sizeBytes: file.size_bytes })),
  }, null, 2));

  for (const file of assigned) {
    const usage = await storageUsage();
    if (usage >= maximumStorageBytes) {
      throw new Error(`R2 storage guard reached before ${file.name}: ${usage} >= ${maximumStorageBytes}`);
    }
    await run(process.execPath, [
      'scripts/ops-targeted-pdf-preview-worker-r2.mjs',
      `--drive-file-id=${file.drive_file_id}`,
    ]);

    const current = (await exactDocuments([file]))[0].document;
    if (!isReady(current)) {
      throw new Error(`Targeted preview did not finish ready: ${file.name}: ${JSON.stringify(current)}`);
    }
  }

  console.log(JSON.stringify({ event: 'parallel_preview_shard_complete', shardIndex, count: assigned.length }));
}

async function audit() {
  await verifyIndexAndObsoleteState();
  const files = await loadIndexedTargets();
  const documents = await exactDocuments(files);
  const notReady = documents.filter(({ document }) => !isReady(document));
  if (notReady.length) {
    throw new Error(`Large textbook previews not fully ready: ${notReady.map(({ file, document }) => `${file.name} [${document?.status || 'missing'} ${document?.pages_ready || 0}/${document?.page_count || 0}]`).join(' | ')}`);
  }
  const usage = await storageUsage();
  if (usage > maximumStorageBytes) throw new Error(`R2 preview usage exceeded guard: ${usage}`);
  console.log(JSON.stringify({
    event: 'parallel_textbook_preview_audit_passed',
    placementsIndexed: PLACEMENT_IDS.length,
    obsoleteIdsGone: OBSOLETE_IDS.length,
    largePdfPreviewsReady: documents.length,
    r2UsageBytes: usage,
    maxTotalPreviewGiB,
  }, null, 2));
}

if (mode === 'wait-index') await waitIndex();
else if (mode === 'shard') await runShard();
else await audit();

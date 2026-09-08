import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { deletePrivateR2Object, listPrivateR2Objects } from './r2-s3.mjs';

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '141RinswVOzK8KaH9ixnoFBTR6IQD1gMy';
const INDEX_SYNC_STATE_ID = '00000000-0000-0000-0000-000000000001';
const R2_BUCKET = process.env.R2_PDF_PREVIEW_BUCKET?.trim() || '';
const PREVIEW_MINIMUM_BYTES = 20 * 1024 * 1024;
const STATE_FILE = '.ops-textbook-library-state.json';

const obsoleteDriveFileIds = [
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

const expectedPlacements = [
  ['A Thousand Splendid Suns - Khaled Hosseini.pdf', '10-zwDEO06p-isXz_nLM0O01pW-EXaaaz', 1253687],
  ['Fahrenheit 451 - Ray Bradbury.pdf', '10-zwDEO06p-isXz_nLM0O01pW-EXaaaz', 2892969],
  ['Klara and the Sun - Kazuo Ishiguro.pdf', '10-zwDEO06p-isXz_nLM0O01pW-EXaaaz', 1061748],
  ['Things Fall Apart - Chinua Achebe.pdf', '10-zwDEO06p-isXz_nLM0O01pW-EXaaaz', 757956],
  ['Panorama Francophone 2 (French ab initio) - Coursebook - Bourdais, Finnie and Talon - Second Edition - Cambridge 2019.epub', '1UoSPFHkK8Yzxo4iQqPs35O0sT_Krdrgk', 86639079],
  ['French B - Course Companion - Christine Trumper and John Israel - Second Edition - Oxford 2018.pdf', '1A2cMZKAYV_uoT35MzCjmX7Uhj1pPuzKR', 226485397],
  ['French B - Course Companion - Answers - Christine Trumper and John Israel - Second Edition - Oxford 2018.pdf', '1A2cMZKAYV_uoT35MzCjmX7Uhj1pPuzKR', 763244],
  ['Diverso Básico (Spanish ab initio) - Libro del alumno - Alonso, Corpas and Gambluch - SGEL 2017.pdf', '1lfmT8_ByIkq7GYcdb-LamxuishOx94bv', 42845511],
  ['Diverso Básico (Spanish ab initio) - Cuaderno de ejercicios - Alonso, Corpas and Gambluch - SGEL 2017.pdf', '1lfmT8_ByIkq7GYcdb-LamxuishOx94bv', 4427292],
  ['Spanish B - Course Companion - Ana Valbuena and Laura Martín Cisneros - Second Edition - Oxford 2018.pdf', '1TPO6D1r2YTMEz8mUTfSzkGLxQGkjQRaM', 176577930],
  ['Spanish B - Course Companion - Answers - Ana Valbuena and Laura Martín Cisneros - Second Edition - Oxford 2018.pdf', '1TPO6D1r2YTMEz8mUTfSzkGLxQGkjQRaM', 2445134],
  ['Business Management - Course Companion - Lominé, Muchena and Pierce - Oxford 2022.pdf', '17gGUIeaN_hFmIbJpMDg457Opto_03ceg', 71752814],
  ['Geography - Course Companion - Garrett Nagle and Briony Cooke - Second Edition - Oxford 2017.pdf', '1nvz3oLsLq2DUbsZTsu8PjjSLe83Zk6Ph', 42565431],
  ['Global Politics - Course Companion - Mooij, Dhesi, Nusseibeh - Oxford 2024.pdf', '1wHlKmW6PzOHtPkK1zcccX1I_An81iXAM', 58556311],
  ['Paper 3 - Europe 20th Century - Pearson 2026.pdf', '1PGI3pLZs9v3nzuBa6APqf9kH3FXIPxn1', 165459044],
  ['Biology - Course Companion - Andrew Allott and David Mindorff - Second Edition - Oxford 2023.pdf', '1dDVMild-XyxgxyJSgt9cvcPqq79ZByih', 190282333],
  ['Environmental Systems and Societies - Course Companion - Rutherford and Williams - Oxford 2024.pdf', '1KAnjmq1JqM08DtEF9EQ1wJ8o7HfsSijh', 144416172],
  ['Physics HL - Chris Hamper - Third Edition - Pearson 2023.pdf', '1moCprZjJ-SVNH5_8ZUvRLMOrtkU3L6io', 87859219],
  ['Physics SL - Chris Hamper - Third Edition - Pearson 2023.pdf', '1moCprZjJ-SVNH5_8ZUvRLMOrtkU3L6io', 70753536],
  ['Sports, Exercise and Health Science - Course Companion - John Sproule - Oxford 2024.pdf', '1xyW64FYXvxt8UvR1iROdbD29bWEn1X13', 89121268],
  ['Computer Science - Course Companion - MacKenty and Stephenson - Oxford 2025.pdf', '1o3vwWkTSD8Oz6Y5TZth8oZyyAX1Xt0-x', 106910254],
  ['Mathematics HL - Analysis and Approaches - Book 2 - Haese 2019.pdf', '1QKdw6KS8HeJP_ud8tAEys7Xsk1n-kzU-', 126184043],
  ['Mathematics HL - Core Topics - Book 1 - Haese 2019.pdf', '1QKdw6KS8HeJP_ud8tAEys7Xsk1n-kzU-', 79033106],
  ['Mathematics SL - Analysis and Approaches - Book 2 - Haese 2019.pdf', '1nniyYHUZ02HdoomkyeSSOAL87lS1EvyK', 84871403],
  ['Mathematics SL - Core Topics - Book 1 - Haese 2019.pdf', '1nniyYHUZ02HdoomkyeSSOAL87lS1EvyK', 56511146],
  ['Mathematics HL - Applications and Interpretation - Book 2 - Haese 2019.pdf', '1waT-0OXy4qaFLWMZOgzOXLBUhXO9fuFL', 144826606],
  ['Mathematics HL - Core Topics - Book 1 - Haese 2019.pdf', '1waT-0OXy4qaFLWMZOgzOXLBUhXO9fuFL', 79033106],
  ['Mathematics SL - Applications and Interpretation - Book 2 - Haese 2019.pdf', '15cou759_X7IgugmuOiPW0x9YD1G-cMjn', 76857472],
  ['Mathematics SL - Core Topics - Book 1 - Haese 2019.pdf', '15cou759_X7IgugmuOiPW0x9YD1G-cMjn', 56511146],
].map(([name, parentId, sizeBytes]) => ({ name, parentId, sizeBytes }));

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

function normalizePrivateKey(raw = '') {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\+\n/g, '\n')
    .replace(/\n\\+/g, '\n')
    .replace(/\\+$/g, '')
    .replace(/\\/g, '')
    .trim();
}

function escapeDriveQueryValue(value) {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function normalizeSearch(value = '') {
  return value.trim().slice(0, 100);
}

function chunk(values, size) {
  const groups = [];
  for (let i = 0; i < values.length; i += size) groups.push(values.slice(i, i + size));
  return groups;
}

async function runWithConcurrency(values, limit, worker) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(values.length, 1)) }, async () => {
    while (next < values.length) {
      const current = values[next++];
      await worker(current);
    }
  });
  await Promise.all(workers);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

async function listAllR2Objects(prefix) {
  const objects = [];
  let continuationToken = null;
  do {
    const page = await listPrivateR2Objects({
      bucket: R2_BUCKET,
      prefix,
      continuationToken,
    });
    objects.push(...page.objects.filter((object) => object.key));
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
  } while (continuationToken);
  return objects;
}

async function listAllSupabaseStorageFiles(bucket, prefix) {
  const files = [];
  const folders = [prefix];
  while (folders.length) {
    const folder = folders.pop();
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`Unable to list Supabase storage ${bucket}/${folder}: ${error.message}`);
      const entries = data || [];
      for (const entry of entries) {
        const full = `${folder}/${entry.name}`;
        if (entry.id) files.push(full);
        else folders.push(full);
      }
      if (entries.length < 1000) break;
      offset += entries.length;
    }
  }
  return files;
}

async function deletePreviewStorage(preview) {
  if (!preview.storage_prefix?.startsWith(`${preview.drive_file_id}/`)) {
    throw new Error(`Unsafe preview prefix for ${preview.drive_file_id}: ${preview.storage_prefix}`);
  }
  if (preview.storage_provider === 'r2') {
    if (preview.storage_bucket !== R2_BUCKET) {
      throw new Error(`Unexpected R2 bucket for ${preview.drive_file_id}: ${preview.storage_bucket}`);
    }
    const objects = await listAllR2Objects(preview.storage_prefix);
    await runWithConcurrency(objects, 12, (object) =>
      deletePrivateR2Object({ bucket: R2_BUCKET, key: object.key }),
    );
    const remaining = await listAllR2Objects(preview.storage_prefix);
    if (remaining.length) throw new Error(`R2 cleanup verification failed for ${preview.drive_file_id}`);
    return { provider: 'r2', objects: objects.length, bytes: objects.reduce((sum, x) => sum + Number(x.size || 0), 0) };
  }
  if (preview.storage_provider === 'supabase') {
    const bucket = preview.storage_bucket || 'pdf-previews';
    const files = await listAllSupabaseStorageFiles(bucket, preview.storage_prefix);
    for (const batch of chunk(files, 100)) {
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) throw new Error(`Unable to delete Supabase preview files for ${preview.drive_file_id}: ${error.message}`);
    }
    const remaining = await listAllSupabaseStorageFiles(bucket, preview.storage_prefix);
    if (remaining.length) throw new Error(`Supabase storage cleanup verification failed for ${preview.drive_file_id}`);
    return { provider: 'supabase', objects: files.length, bytes: null };
  }
  throw new Error(`Unsupported preview storage provider for ${preview.drive_file_id}: ${preview.storage_provider}`);
}

async function resolveExpectedPlacements() {
  const resolved = [];
  for (const placement of expectedPlacements) {
    const q = [
      `'${escapeDriveQueryValue(placement.parentId)}' in parents`,
      `name = '${escapeDriveQueryValue(placement.name)}'`,
      'trashed = false',
    ].join(' and ');
    const response = await drive.files.list({
      q,
      fields: 'files(id,name,mimeType,size,modifiedTime,parents,trashed)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = response.data.files || [];
    if (files.length !== 1) {
      throw new Error(`Expected exactly one active Drive file for ${placement.name} in ${placement.parentId}; found ${files.length}`);
    }
    const file = files[0];
    if (Number(file.size || 0) !== placement.sizeBytes) {
      throw new Error(`Drive size mismatch for ${placement.name}: ${file.size} != ${placement.sizeBytes}`);
    }
    if (placement.name.toLowerCase().endsWith('.pdf') && file.mimeType !== 'application/pdf') {
      throw new Error(`Unexpected MIME type for ${placement.name}: ${file.mimeType}`);
    }
    resolved.push({
      ...placement,
      id: file.id,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime || null,
    });
    console.log(JSON.stringify({ event: 'textbook_drive_placement_verified', id: file.id, name: file.name, parentId: placement.parentId, sizeBytes: placement.sizeBytes }));
  }
  const ids = new Set(resolved.map((item) => item.id));
  if (ids.size !== expectedPlacements.length) {
    throw new Error(`Expected ${expectedPlacements.length} distinct Drive placement IDs; found ${ids.size}`);
  }
  return resolved;
}

async function proveObsoleteSourcesRemoved() {
  const states = [];
  for (const id of obsoleteDriveFileIds) {
    try {
      const response = await drive.files.get({
        fileId: id,
        fields: 'id,name,trashed,parents,size,mimeType',
        supportsAllDrives: true,
      });
      const file = response.data;
      if (!file.trashed) throw new Error(`Refusing cleanup because obsolete Drive file is still active: ${file.name} (${id})`);
      states.push({ id, state: 'trashed', name: file.name || null });
    } catch (error) {
      const message = String(error?.message || '');
      if (message.startsWith('Refusing cleanup')) throw error;
      const status = Number(error?.code || error?.response?.status || 0);
      if (status !== 404) throw new Error(`Unable to prove obsolete Drive file ${id} is removed (status ${status || 'unknown'})`);
      states.push({ id, state: 'not_found', name: null });
    }
  }
  return states;
}

async function cleanupObsoletePreviewState(sourceStates) {
  const namesById = new Map(sourceStates.filter((x) => x.name).map((x) => [x.id, x.name]));
  const { data: indexRows, error: indexError } = await supabase
    .from('dp_resource_index')
    .select('drive_file_id,name,path')
    .in('drive_file_id', obsoleteDriveFileIds);
  if (indexError) throw new Error(indexError.message);
  for (const row of indexRows || []) {
    const expectedName = namesById.get(row.drive_file_id);
    if (expectedName && row.name !== expectedName) {
      throw new Error(`Indexed filename mismatch for obsolete ${row.drive_file_id}: ${row.name} != ${expectedName}`);
    }
    if (!row.path?.endsWith(` / ${row.name}`)) {
      throw new Error(`Unsafe indexed path for obsolete ${row.drive_file_id}: ${row.path}`);
    }
  }

  const { data: previews, error: previewError } = await supabase
    .from('dp_pdf_preview_documents')
    .select('id,drive_file_id,source_name,storage_prefix,storage_provider,storage_bucket,status,page_count,pages_ready')
    .in('drive_file_id', obsoleteDriveFileIds);
  if (previewError) throw new Error(previewError.message);

  const storageResults = [];
  for (const preview of previews || []) {
    const expectedName = namesById.get(preview.drive_file_id);
    if (expectedName && preview.source_name !== expectedName) {
      throw new Error(`Preview filename mismatch for obsolete ${preview.drive_file_id}: ${preview.source_name} != ${expectedName}`);
    }
    storageResults.push({ driveFileId: preview.drive_file_id, documentId: preview.id, ...(await deletePreviewStorage(preview)) });
  }

  if (previews?.length) {
    const { error } = await supabase
      .from('dp_pdf_preview_documents')
      .delete()
      .in('id', previews.map((preview) => preview.id));
    if (error) throw new Error(`Unable to delete obsolete preview documents: ${error.message}`);
  }

  const { error: deleteIndexError } = await supabase
    .from('dp_resource_index')
    .delete()
    .in('drive_file_id', obsoleteDriveFileIds);
  if (deleteIndexError) throw new Error(`Unable to delete obsolete index rows: ${deleteIndexError.message}`);

  const [{ data: remainingIndex, error: verifyIndexError }, { data: remainingPreviews, error: verifyPreviewError }] = await Promise.all([
    supabase.from('dp_resource_index').select('drive_file_id').in('drive_file_id', obsoleteDriveFileIds),
    supabase.from('dp_pdf_preview_documents').select('id,drive_file_id').in('drive_file_id', obsoleteDriveFileIds),
  ]);
  if (verifyIndexError) throw new Error(verifyIndexError.message);
  if (verifyPreviewError) throw new Error(verifyPreviewError.message);
  if ((remainingIndex || []).length || (remainingPreviews || []).length) {
    throw new Error('Obsolete database rows remain after cleanup');
  }

  console.log(JSON.stringify({
    event: 'obsolete_textbook_preview_state_removed',
    obsoleteDriveFiles: sourceStates,
    indexRowsRemoved: indexRows?.length || 0,
    previewDocumentsRemoved: previews?.length || 0,
    storageResults,
  }, null, 2));
}

async function readIndexCounts() {
  const [{ count: total, error: totalError }, { count: folders, error: folderError }, { count: files, error: fileError }] = await Promise.all([
    supabase.from('dp_resource_index').select('id', { count: 'exact', head: true }),
    supabase.from('dp_resource_index').select('id', { count: 'exact', head: true }).eq('is_folder', true),
    supabase.from('dp_resource_index').select('id', { count: 'exact', head: true }).eq('is_folder', false),
  ]);
  if (totalError || folderError || fileError) throw new Error(totalError?.message || folderError?.message || fileError?.message);
  return { total: total || 0, folders: folders || 0, files: files || 0 };
}

async function upsertIndexRows(rows, syncRunId) {
  for (const batch of chunk(rows, 750)) {
    const payload = batch.map((row) => ({ ...row, last_seen_sync_run_id: syncRunId }));
    const { error } = await supabase.from('dp_resource_index').upsert(payload, { onConflict: 'drive_file_id' });
    if (error) throw new Error(`Index upsert failed: ${error.message}`);
    const { error: attributionError } = await supabase.rpc('dp_seed_resource_attribution', {
      p_drive_file_ids: payload.map((row) => row.drive_file_id),
    });
    if (attributionError) throw new Error(`Resource attribution seed failed: ${attributionError.message}`);
  }
}

async function crawlFolder(folder, syncRunId) {
  const children = [];
  let rowsCount = 0;
  let filesCount = 0;
  let foldersCount = 0;
  let pageToken;
  do {
    const response = await drive.files.list({
      q: [`'${escapeDriveQueryValue(folder.id)}' in parents`, 'trashed = false'].join(' and '),
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
      orderBy: 'folder,name',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const items = response.data.files || [];
    const rows = items.map((item) => {
      const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
      if (isFolder) {
        children.push({ id: item.id, path: `${folder.path} / ${item.name}` });
        foldersCount += 1;
      } else {
        filesCount += 1;
      }
      return {
        drive_file_id: item.id,
        parent_drive_file_id: folder.id,
        name: item.name || 'Untitled',
        normalized_name: normalizeSearch(item.name || 'Untitled'),
        path: `${folder.path} / ${item.name || 'Untitled'}`,
        mime_type: item.mimeType || 'application/octet-stream',
        is_folder: isFolder,
        size_bytes: item.size ? Number(item.size) : null,
        modified_at: item.modifiedTime || null,
      };
    });
    await upsertIndexRows(rows, syncRunId);
    rowsCount += rows.length;
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return { children, rowsCount, filesCount, foldersCount };
}

async function refreshFullDriveIndex(resolvedPlacements) {
  const { data: existingState, error: stateError } = await supabase
    .from('dp_resource_index_sync_state')
    .select('*')
    .eq('id', INDEX_SYNC_STATE_ID)
    .maybeSingle();
  if (stateError) throw new Error(stateError.message);
  if (existingState?.status === 'indexing' && existingState.lock_expires_at && Date.parse(existingState.lock_expires_at) > Date.now()) {
    throw new Error('Refusing ops index refresh because another live index worker currently holds the lock');
  }

  const baseline = await readIndexCounts();
  const syncRunId = randomUUID();
  const lockToken = `ops-textbook-${syncRunId}`;
  const startedAt = new Date().toISOString();
  const lockExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const initialState = {
    id: INDEX_SYNC_STATE_ID,
    status: 'indexing',
    phase: 'scanning',
    sync_run_id: syncRunId,
    folder_queue: [{ id: ROOT_FOLDER_ID, path: 'Library', parent: null }],
    processed_folders: 0,
    indexed_resources: 0,
    indexed_files: 0,
    indexed_folders: 0,
    baseline_total_items: baseline.total,
    baseline_total_folders: baseline.folders,
    queue_depth: 1,
    continuation_pages: 0,
    current_path: 'Library',
    started_at: startedAt,
    heartbeat_at: startedAt,
    updated_at: startedAt,
    error_message: null,
    lock_token: lockToken,
    lock_expires_at: lockExpiresAt,
    last_batch_items: 0,
    last_batch_folders: 0,
    last_batch_ms: 0,
  };
  const { error: startError } = await supabase
    .from('dp_resource_index_sync_state')
    .upsert(initialState, { onConflict: 'id' });
  if (startError) throw new Error(startError.message);

  const queue = [{ id: ROOT_FOLDER_ID, path: 'Library' }];
  const seenIds = new Set();
  let processedFolders = 0;
  let indexedResources = 0;
  let indexedFiles = 0;
  let indexedFolders = 0;
  const startedMs = Date.now();

  try {
    while (queue.length) {
      const wave = queue.splice(0, Math.min(8, queue.length));
      const results = await Promise.all(wave.map((folder) => crawlFolder(folder, syncRunId)));
      for (let i = 0; i < results.length; i += 1) {
        const result = results[i];
        queue.push(...result.children);
        processedFolders += 1;
        indexedResources += result.rowsCount;
        indexedFiles += result.filesCount;
        indexedFolders += result.foldersCount;
      }

      const heartbeat = new Date().toISOString();
      const { error: heartbeatError } = await supabase
        .from('dp_resource_index_sync_state')
        .update({
          status: 'indexing',
          phase: 'scanning',
          folder_queue: queue.slice(0, 2000).map((x) => ({ ...x, parent: null })),
          processed_folders: processedFolders,
          indexed_resources: indexedResources,
          indexed_files: indexedFiles,
          indexed_folders: indexedFolders,
          queue_depth: queue.length,
          current_path: queue[0]?.path || null,
          heartbeat_at: heartbeat,
          updated_at: heartbeat,
          lock_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          last_batch_items: results.reduce((sum, x) => sum + x.rowsCount, 0),
          last_batch_folders: wave.length,
          last_batch_ms: Math.max(Date.now() - startedMs, 1),
        })
        .eq('id', INDEX_SYNC_STATE_ID)
        .eq('lock_token', lockToken);
      if (heartbeatError) throw new Error(heartbeatError.message);
    }

    if (baseline.total >= 100 && indexedResources < Math.floor(baseline.total * 0.8)) {
      throw new Error(`Safety gate refused stale-row cleanup: crawl saw only ${indexedResources} resources versus baseline ${baseline.total}`);
    }

    const expectedIds = resolvedPlacements.map((item) => item.id);
    for (const idBatch of chunk(expectedIds, 100)) {
      const { data, error } = await supabase
        .from('dp_resource_index')
        .select('drive_file_id')
        .in('drive_file_id', idBatch)
        .eq('last_seen_sync_run_id', syncRunId);
      if (error) throw new Error(error.message);
      for (const row of data || []) seenIds.add(row.drive_file_id);
    }
    const missing = expectedIds.filter((id) => !seenIds.has(id));
    if (missing.length) throw new Error(`Safety gate refused stale-row cleanup because ${missing.length} expected new Drive placements were not seen: ${missing.join(', ')}`);

    const { error: cleanupError } = await supabase
      .from('dp_resource_index')
      .delete()
      .or(`last_seen_sync_run_id.neq.${syncRunId},last_seen_sync_run_id.is.null`);
    if (cleanupError) throw new Error(`Stale index cleanup failed: ${cleanupError.message}`);

    const { error: inheritanceError } = await supabase.rpc('dp_resolve_resource_source_inheritance', {
      p_resolution_version: `index-sync:${syncRunId}`,
    });
    if (inheritanceError) throw new Error(`Source inheritance rebuild failed: ${inheritanceError.message}`);

    const completedAt = new Date().toISOString();
    const { error: completeError } = await supabase
      .from('dp_resource_index_sync_state')
      .update({
        status: 'complete',
        phase: 'complete',
        folder_queue: [],
        processed_folders: processedFolders,
        indexed_resources: indexedResources,
        indexed_files: indexedFiles,
        indexed_folders: indexedFolders,
        baseline_total_items: indexedResources,
        baseline_total_folders: indexedFolders,
        queue_depth: 0,
        continuation_pages: 0,
        current_path: null,
        heartbeat_at: completedAt,
        completed_at: completedAt,
        updated_at: completedAt,
        error_message: null,
        lock_token: null,
        lock_expires_at: null,
        last_batch_items: indexedResources,
        last_batch_folders: processedFolders,
        last_batch_ms: Math.max(Date.now() - startedMs, 1),
      })
      .eq('id', INDEX_SYNC_STATE_ID)
      .eq('lock_token', lockToken);
    if (completeError) throw new Error(completeError.message);

    console.log(JSON.stringify({
      event: 'textbook_ops_index_refresh_complete',
      syncRunId,
      baseline,
      indexedResources,
      indexedFiles,
      indexedFolders,
      processedFolders,
      durationMs: Date.now() - startedMs,
    }, null, 2));
    return syncRunId;
  } catch (error) {
    const failedAt = new Date().toISOString();
    await supabase
      .from('dp_resource_index_sync_state')
      .update({
        status: 'failed',
        phase: 'paused',
        folder_queue: queue.slice(0, 2000).map((x) => ({ ...x, parent: null })),
        processed_folders: processedFolders,
        indexed_resources: indexedResources,
        indexed_files: indexedFiles,
        indexed_folders: indexedFolders,
        queue_depth: queue.length,
        current_path: queue[0]?.path || null,
        heartbeat_at: failedAt,
        updated_at: failedAt,
        error_message: error instanceof Error ? error.message : String(error),
        lock_token: null,
        lock_expires_at: null,
      })
      .eq('id', INDEX_SYNC_STATE_ID)
      .eq('lock_token', lockToken);
    throw error;
  }
}

async function verifyIndexedPlacements(resolvedPlacements) {
  const ids = resolvedPlacements.map((item) => item.id);
  const indexed = [];
  for (const idBatch of chunk(ids, 100)) {
    const { data, error } = await supabase
      .from('dp_resource_index')
      .select('drive_file_id,parent_drive_file_id,name,size_bytes,mime_type,path,is_folder')
      .in('drive_file_id', idBatch);
    if (error) throw new Error(error.message);
    indexed.push(...(data || []));
  }
  const byId = new Map(indexed.map((row) => [row.drive_file_id, row]));
  for (const placement of resolvedPlacements) {
    const row = byId.get(placement.id);
    if (!row) throw new Error(`Indexed placement missing after refresh: ${placement.name} (${placement.id})`);
    if (row.parent_drive_file_id !== placement.parentId || row.name !== placement.name || Number(row.size_bytes || 0) !== placement.sizeBytes || row.is_folder) {
      throw new Error(`Indexed placement mismatch after refresh: ${placement.name} (${placement.id})`);
    }
  }
  const { data: obsoleteIndex, error: obsoleteIndexError } = await supabase
    .from('dp_resource_index')
    .select('drive_file_id,name')
    .in('drive_file_id', obsoleteDriveFileIds);
  if (obsoleteIndexError) throw new Error(obsoleteIndexError.message);
  if (obsoleteIndex?.length) throw new Error(`Obsolete index rows reappeared after refresh: ${obsoleteIndex.map((x) => x.drive_file_id).join(', ')}`);
}

async function main() {
  console.log(JSON.stringify({ event: 'textbook_ops_started', expectedPlacements: expectedPlacements.length, obsoleteDriveFiles: obsoleteDriveFileIds.length }));
  const resolvedPlacements = await resolveExpectedPlacements();
  const sourceStates = await proveObsoleteSourcesRemoved();
  await cleanupObsoletePreviewState(sourceStates);
  const syncRunId = await refreshFullDriveIndex(resolvedPlacements);
  await verifyIndexedPlacements(resolvedPlacements);

  const previewTargets = resolvedPlacements.filter(
    (item) => item.name.toLowerCase().endsWith('.pdf') && item.sizeBytes >= PREVIEW_MINIMUM_BYTES,
  );
  await writeFile(
    STATE_FILE,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      syncRunId,
      obsoleteDriveFileIds,
      placements: resolvedPlacements,
      previewTargets,
      previewMinimumBytes: PREVIEW_MINIMUM_BYTES,
    }, null, 2),
    'utf8',
  );

  console.log(JSON.stringify({
    event: 'textbook_ops_pre_preview_complete',
    placementsVerified: resolvedPlacements.length,
    obsoleteDriveFilesVerifiedRemoved: sourceStates.length,
    previewTargets: previewTargets.length,
    stateFile: STATE_FILE,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

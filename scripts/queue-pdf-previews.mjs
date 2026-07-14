import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const minSizeArgument = process.argv.find((value) => value.startsWith('--min-size-mb='));
const minSizeMb = Number(minSizeArgument?.split('=')[1] || process.env.PDF_PREVIEW_QUEUE_MIN_SIZE_MB || 0);
if (!Number.isFinite(minSizeMb) || minSizeMb < 0) throw new Error('Minimum size must be zero or greater');
const minimumBytes = Math.floor(minSizeMb * 1024 * 1024);

const driveFileArgument = process.argv.find((value) => value.startsWith('--drive-file-id='));
const driveFileId = driveFileArgument?.slice('--drive-file-id='.length).trim() || '';
if (driveFileArgument && !driveFileId) throw new Error('Drive file ID must not be empty');

const providerArgument = process.argv.find((value) => value.startsWith('--storage-provider='));
const requestedProvider = (providerArgument?.slice('--storage-provider='.length) || process.env.PDF_PREVIEW_STORAGE_PROVIDER || 'supabase').trim().toLowerCase();
if (!['supabase', 'r2'].includes(requestedProvider)) throw new Error('Storage provider must be supabase or r2');
const requestedBucket = requestedProvider === 'r2'
  ? process.env.R2_PDF_PREVIEW_BUCKET?.trim()
  : process.env.PDF_PREVIEW_SUPABASE_BUCKET?.trim() || 'pdf-previews';
if (!requestedBucket) throw new Error(`Storage bucket is required for ${requestedProvider}`);

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

async function queueFile(file) {
  const version = versionKey(file);
  const modifiedAt = normalizeModifiedTime(file.modified_at) || null;
  const { data, error } = await supabase.rpc('dp_queue_pdf_preview_v2', {
    p_drive_file_id: file.drive_file_id,
    p_source_name: file.name,
    p_source_modified_at: modifiedAt,
    p_source_size_bytes: file.size_bytes,
    p_version_key: version,
    p_storage_prefix: `${file.drive_file_id}/${version}`,
    p_storage_provider: requestedProvider,
    p_storage_bucket: requestedBucket,
  });
  if (error) throw new Error(`Unable to queue ${file.name}: ${error.message}`);
  let document = Array.isArray(data) ? data[0] || null : data || null;
  if (!document) throw new Error(`Queueing did not return a document for ${file.name}`);

  // A user may have opened an unprepared PDF before the GitHub job started, leaving
  // a zero-page Supabase queue row. Move only an unlocked queued/failed row; never
  // redirect an active or partially prepared worker to another provider.
  if (
    Number(document.pages_ready) === 0 &&
    ['queued', 'failed'].includes(document.status) &&
    !document.locked_by &&
    (document.storage_provider !== requestedProvider || document.storage_bucket !== requestedBucket)
  ) {
    const { data: updated, error: updateError } = await supabase
      .from('dp_pdf_preview_documents')
      .update({
        storage_provider: requestedProvider,
        storage_bucket: requestedBucket,
        updated_at: new Date().toISOString(),
      })
      .eq('id', document.id)
      .eq('pages_ready', 0)
      .in('status', ['queued', 'failed'])
      .is('locked_by', null)
      .select('*')
      .maybeSingle();
    if (updateError) throw new Error(`Unable to select ${requestedProvider} storage for ${file.name}: ${updateError.message}`);
    if (updated) document = updated;
  }

  return { version, document };
}

async function main() {
  let offset = 0;
  let queued = 0;
  while (true) {
    let query = supabase
      .from('dp_resource_index')
      .select('drive_file_id,name,size_bytes,modified_at')
      .eq('is_folder', false)
      .eq('mime_type', 'application/pdf');

    if (driveFileId) query = query.eq('drive_file_id', driveFileId);
    else query = query.gte('size_bytes', minimumBytes).order('size_bytes', { ascending: false });

    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(`Unable to read PDF resources: ${error.message}`);
    if (!data?.length) break;

    for (const file of data) {
      if (!Number.isSafeInteger(Number(file.size_bytes)) || Number(file.size_bytes) <= 0) continue;
      const result = await queueFile({ ...file, size_bytes: Number(file.size_bytes) });
      queued += 1;
      console.log(JSON.stringify({
        event: 'pdf_preview_queued',
        fileId: file.drive_file_id,
        name: file.name,
        sizeBytes: file.size_bytes,
        version: result.version,
        documentId: result.document.id,
        storageProvider: result.document.storage_provider,
        storageBucket: result.document.storage_bucket,
      }));
    }

    if (driveFileId || data.length < 500) break;
    offset += data.length;
  }

  if (driveFileId && queued !== 1) {
    throw new Error(`No indexed PDF was found for Drive file ID ${driveFileId}`);
  }

  console.log(JSON.stringify({
    event: 'pdf_preview_queue_complete',
    queued,
    minimumBytes,
    driveFileId: driveFileId || null,
    requestedProvider,
    requestedBucket,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

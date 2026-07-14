import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const minSizeArgument = process.argv.find((value) => value.startsWith('--min-size-mb='));
const minSizeMb = Number(minSizeArgument?.split('=')[1] || process.env.PDF_PREVIEW_QUEUE_MIN_SIZE_MB || 0);
if (!Number.isFinite(minSizeMb) || minSizeMb < 0) throw new Error('Minimum size must be zero or greater');
const minimumBytes = Math.floor(minSizeMb * 1024 * 1024);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function versionKey(file) {
  return createHash('sha256')
    .update(`${file.drive_file_id}\n${file.modified_at || ''}\n${file.size_bytes}`)
    .digest('hex');
}

async function queueFile(file) {
  const version = versionKey(file);
  const { error } = await supabase.rpc('dp_queue_pdf_preview', {
    p_drive_file_id: file.drive_file_id,
    p_source_name: file.name,
    p_source_modified_at: file.modified_at,
    p_source_size_bytes: file.size_bytes,
    p_version_key: version,
    p_storage_prefix: `${file.drive_file_id}/${version}`,
  });
  if (error) throw new Error(`Unable to queue ${file.name}: ${error.message}`);
}

async function main() {
  let offset = 0;
  let queued = 0;
  while (true) {
    const { data, error } = await supabase
      .from('dp_resource_index')
      .select('drive_file_id,name,size_bytes,modified_at')
      .eq('is_folder', false)
      .eq('mime_type', 'application/pdf')
      .gte('size_bytes', minimumBytes)
      .order('size_bytes', { ascending: false })
      .range(offset, offset + 499);
    if (error) throw new Error(`Unable to read PDF resources: ${error.message}`);
    if (!data?.length) break;
    for (const file of data) {
      if (!Number.isSafeInteger(Number(file.size_bytes)) || Number(file.size_bytes) <= 0) continue;
      await queueFile({ ...file, size_bytes: Number(file.size_bytes) });
      queued += 1;
      console.log(JSON.stringify({ event: 'pdf_preview_queued', fileId: file.drive_file_id, name: file.name, sizeBytes: file.size_bytes }));
    }
    if (data.length < 500) break;
    offset += data.length;
  }
  console.log(JSON.stringify({ event: 'pdf_preview_queue_complete', queued, minimumBytes }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

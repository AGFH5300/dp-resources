import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const driveFileArgument = process.argv.find((value) => value.startsWith('--drive-file-id='));
const driveFileId = driveFileArgument?.slice('--drive-file-id='.length).trim() || '';
if (!driveFileId) throw new Error('Usage: node scripts/prepare-pdf-preview.mjs --drive-file-id=<Google Drive file ID>');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

async function latestDocument() {
  const { data, error } = await supabase
    .from('dp_pdf_preview_documents')
    .select('*')
    .eq('drive_file_id', driveFileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to read the targeted preview document: ${error.message}`);
  return data || null;
}

async function main() {
  console.log(JSON.stringify({ event: 'pdf_preview_manual_prepare_started', driveFileId }));

  await run(process.execPath, [
    'scripts/queue-pdf-previews.mjs',
    `--drive-file-id=${driveFileId}`,
  ]);

  const document = await latestDocument();
  if (!document) throw new Error(`Queueing did not create a preview document for ${driveFileId}`);
  if (document.status === 'ready' && Number(document.pages_ready) === Number(document.page_count)) {
    console.log(JSON.stringify({
      event: 'pdf_preview_manual_prepare_already_ready',
      driveFileId,
      pageCount: document.page_count,
    }));
    return;
  }

  // Render Free has no separate background worker. Put this selected document at the
  // front of the existing atomic worker queue, then run the worker for exactly one job.
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

  await run(process.execPath, ['scripts/pdf-preview-worker.mjs', '--once']);

  const completed = await latestDocument();
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
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

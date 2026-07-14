import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Render Free PDF preview preparation', () => {
  it('exposes one manual workflow for single PDFs, textbooks, or all large PDFs', () => {
    const workflow = read('.github/workflows/prepare-pdf-previews.yml');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('all_large_pdfs');
    expect(workflow).toContain('largest_textbooks');
    expect(workflow).toContain('single_pdf');
    expect(workflow).toContain('drive_file_id:');
    expect(workflow).toContain('minimum_size_mib:');
    expect(workflow).toContain('maximum_books:');
    expect(workflow).toContain('max_total_preview_gib:');
    expect(workflow).toContain('poppler-utils');
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('scripts/prepare-pdf-previews-batch.mjs');
    expect(workflow).toContain('scripts/verify-r2-preview-storage.mjs');
    expect(workflow).toContain('secrets.SUPABASE_SERVICE_ROLE_KEY');
    expect(workflow).toContain('secrets.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
    expect(workflow).toContain('secrets.R2_ACCESS_KEY_ID');
    expect(workflow).toContain('group: pdf-preview-generation');
  });

  it('fails fast by writing, reading and deleting a tiny private R2 object', () => {
    const preflight = read('scripts/verify-r2-preview-storage.mjs');
    expect(preflight).toContain('putPrivateR2Object');
    expect(preflight).toContain('getPrivateR2Object');
    expect(preflight).toContain('deletePrivateR2Object');
    expect(preflight).toContain('downloaded.equals(payload)');
    expect(preflight).toContain('finally');
  });

  it('queues and prepares the exact normalized Drive version without moving active jobs', () => {
    const queue = read('scripts/queue-pdf-previews.mjs');
    const prepare = read('scripts/prepare-pdf-preview.mjs');
    expect(queue).toContain('--drive-file-id=');
    expect(queue).toContain('--storage-provider=');
    expect(queue).toContain(".eq('drive_file_id', driveFileId)");
    expect(queue).toContain('No indexed PDF was found for Drive file ID');
    expect(queue).toContain('dp_queue_pdf_preview_v2');
    expect(queue).toContain("['queued', 'failed'].includes(document.status)");
    expect(queue).toContain(".in('status', ['queued', 'failed'])");
    expect(queue).toContain(".is('locked_by', null)");
    expect(prepare).toContain(".eq('version_key', version)");
    expect(prepare).toContain("provider === 'r2' ? 'scripts/pdf-preview-worker-r2.mjs' : 'scripts/pdf-preview-worker.mjs'");
    expect(prepare).toContain('queued_at: priorityTime');
    expect(prepare).toContain("completed.status !== 'ready'");
    expect(prepare).toContain('Boolean(document.text_ready_at)');
  });

  it('selects large PDFs, skips searchable ready versions, and processes sequentially', () => {
    const batch = read('scripts/prepare-pdf-previews-batch.mjs');
    expect(batch).toContain('isLikelyTextbook');
    expect(batch).toContain('loadLargePdfs');
    expect(batch).toContain("selection === 'all_large_pdfs'");
    expect(batch).toContain("existing?.status === 'ready'");
    expect(batch).toContain('Boolean(existing.text_ready_at)');
    expect(batch).toContain('for (const file of selected)');
    expect(batch).toContain('await run(process.execPath');
    expect(batch).toContain('dp_pdf_preview_storage_usage');
    expect(batch).toContain('pdf_preview_batch_storage_limit_reached');
    expect(batch).toContain('GITHUB_STEP_SUMMARY');
    expect(batch).not.toContain('Promise.all(selected');
  });

  it('uploads page batches concurrently, retries transient failures, resumes pages, and extracts search text', () => {
    const workflow = read('.github/workflows/prepare-pdf-previews.yml');
    const worker = read('scripts/pdf-preview-worker.mjs');
    expect(workflow).toContain("PDF_PREVIEW_BATCH_SIZE: '40'");
    expect(workflow).toContain("PDF_PREVIEW_UPLOAD_CONCURRENCY: '6'");
    expect(workflow).toContain("PDF_PREVIEW_UPLOAD_ATTEMPTS: '5'");
    expect(worker).toContain('pdf_preview_upload_retry');
    expect(worker).toContain('mapConcurrent(rendered, UPLOAD_CONCURRENCY');
    expect(worker).toContain(".upsert(rows, {");
    expect(worker).toContain('pdf_preview_resume_state');
    expect(worker).toContain('existingReadyPages(job.id)');
    expect(worker).toContain("execFile('pdftotext'");
    expect(worker).toContain('dp_store_pdf_preview_text');
    expect(worker).toContain('pts(?:\\s+\\([^\\r\\n]*\\))?\\s*$');
    expect(worker).not.toContain(".eq('page_number', pageNumber)");
  });

  it('keeps the standard reader inside the single PDF toolbar rather than a second bordered strip', () => {
    const preview = read('app/resource/[fileId]/resource-preview.tsx');
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(preview).not.toContain('Preview not prepared? Open standard reader');
    expect(preview).toContain("if (cap.previewMode === 'pdf') return <PdfViewer");
    expect(viewer).toContain('Open standard reader');
    expect(viewer).toContain("window.open(`/api/resource/${encodeURIComponent(fileId)}/content#page=${currentRef.current}`");
  });
});

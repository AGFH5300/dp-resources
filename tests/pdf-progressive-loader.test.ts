import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getResourceCapability } from '../lib/resource-capabilities';
import { parseSingleByteRange } from '../lib/range-requests';
import { byteRangeLength, expectedPdfContentRange, validatePdfRangeUpstream } from '../lib/pdf-range-integrity';
import { createPdfPreviewSession, verifyPdfPreviewSession } from '../lib/pdf-preview-session';

const read = (path: string) => readFileSync(path, 'utf8');

describe('private PDF preview derivatives', () => {
  it('keeps PDF support while using an integrated continuous reader', () => {
    const capability = getResourceCapability('application/pdf', 'large-book.pdf');
    expect(capability.previewMode).toBe('pdf');

    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(viewer).toContain('continuous PDF preview');
    expect(viewer).toContain('IntersectionObserver');
    expect(viewer).toContain("rootMargin:'1600px 0px'");
    expect(viewer).toContain('Loading page…');
    expect(viewer).toContain('Preparing page…');
    expect(viewer).toContain('<img');
    expect(viewer).not.toContain('<iframe');
    expect(viewer).not.toContain("import('pdfjs-dist");
    expect(viewer).not.toContain('<canvas');
    expect(viewer).not.toContain('Previous page');
    expect(viewer).not.toContain('Next page');
  });

  it('provides one compact toolbar with direct navigation and document controls', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    for (const label of [
      'Page number',
      'Zoom out',
      'Reset zoom',
      'Zoom in',
      'Fit to width',
      'Rotate pages',
      'Search document',
      'Annotations',
      'Undo annotation',
      'Redo annotation',
      'Download PDF',
      'Print PDF',
      'Open standard reader',
      'Full screen',
      'Retry preview',
    ]) expect(viewer).toContain(label);
    expect(viewer).toContain("scrollIntoView({behavior,block:'start'})");
    expect(viewer).toContain("e.key.toLowerCase()==='f'");
    expect(viewer).toContain("e.key.toLowerCase()==='p'");
    expect(viewer).not.toContain('Authentication happens once');
    expect(viewer).not.toContain('signed session');
    expect(viewer).not.toContain('Range request');
  });

  it('keeps annotations private to the browser with undo, redo, pen, highlight and erase', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(viewer).toContain('dp-pdf-annotations:');
    expect(viewer).toContain('localStorage.getItem');
    expect(viewer).toContain('localStorage.setItem');
    expect(viewer).toContain('Pen colour');
    expect(viewer).toContain('Highlight');
    expect(viewer).toContain('Erase');
    expect(viewer).toContain('Clear page');
    expect(viewer).toContain('Clear all');
    expect(viewer).toContain('<svg');
    expect(viewer).toContain('<polyline');
    expect(viewer).toContain('Saved only in this browser.');
  });

  it('removes the duplicate PDF download and doubled fallback strip', () => {
    const page = read('app/resource/[fileId]/page.tsx');
    const preview = read('app/resource/[fileId]/resource-preview.tsx');
    expect(page).toContain("downloadHref={!meta.isFolder&&!isPdf?");
    expect(preview).toContain("if (cap.previewMode === 'pdf') return <PdfViewer");
    expect(preview).not.toContain('Preview not prepared? Open standard reader');
  });

  it('authorizes once and serves private same-origin manifests, search and page images', () => {
    const sessionRoute = read('app/api/resource/[fileId]/pdf-session/route.ts');
    const statusRoute = read('app/api/resource/[fileId]/pdf-preview/status/route.ts');
    const manifestRoute = read('app/api/resource/[fileId]/pdf-preview/manifest/route.ts');
    const searchRoute = read('app/api/resource/[fileId]/pdf-preview/search/route.ts');
    const pageRoute = read('app/api/resource/[fileId]/pdf-preview/page/[pageNumber]/route.ts');
    const token = read('lib/pdf-preview-session.ts');

    expect(sessionRoute).toContain('requireMember');
    expect(sessionRoute).toContain('recordFileOpenedOnce');
    expect(sessionRoute).toContain('ensurePdfPreviewDocument');
    expect(sessionRoute).toContain('assertInsideRoot');
    expect(sessionRoute).toContain('getDriveMetadata');
    expect(sessionRoute).not.toContain('getIndexedResourceShell');
    expect(sessionRoute).toContain('previewStorageProvider: preview.storage_provider');
    expect(sessionRoute).toContain('HttpOnly');
    expect(sessionRoute).toContain('SameSite=Lax');
    expect(token).toContain('pdfPreviewSessionFromRequest');
    expect(token).toContain("previewStorageProvider: 'supabase' | 'r2'");
    for (const route of [statusRoute, manifestRoute, searchRoute, pageRoute]) expect(route).toContain('pdfPreviewSessionFromRequest');
    expect(searchRoute).toContain("url.searchParams.get('v')");
    expect(searchRoute).toContain('dp_search_pdf_preview');
    expect(searchRoute).not.toContain('requireMember');
    expect(statusRoute).not.toContain('requireMember');
    expect(manifestRoute).not.toContain('requireMember');
    expect(pageRoute).not.toContain('requireMember');
    expect(pageRoute).toContain('/storage/v1/object/authenticated/');
    expect(pageRoute).toContain('getPrivateR2Object');
    expect(pageRoute).toContain('session.previewStoragePrefix');
    expect(pageRoute).toContain('page-${pageNumber}.jpg');
    expect(pageRoute).not.toContain('getPdfPreviewPageByIdentity');
    expect(pageRoute).toContain('Authorization: `Bearer ${serviceRoleKey}`');
    expect(pageRoute).not.toContain('createSignedUrl');
  });

  it('uses private provider metadata and resumable image plus text preparation', () => {
    const originalMigration = read('supabase/migrations/20260714110000_private_pdf_preview_derivatives.sql');
    const providerMigration = read('supabase/migrations/20260714150000_pdf_preview_r2_storage.sql');
    const searchMigration = read('supabase/migrations/20260714193000_pdf_preview_search_text.sql');
    const worker = read('scripts/pdf-preview-worker.mjs');
    const r2Worker = read('scripts/pdf-preview-worker-r2.mjs');
    const queue = read('scripts/queue-pdf-previews.mjs');
    const prepare = read('scripts/prepare-pdf-preview.mjs');
    const batch = read('scripts/prepare-pdf-previews-batch.mjs');
    const workflow = read('.github/workflows/prepare-pdf-previews.yml');
    const dockerfile = read('Dockerfile');

    expect(originalMigration).toContain("values ('pdf-previews', 'pdf-previews', false");
    expect(originalMigration).toContain('enable row level security');
    expect(originalMigration).toContain('dp_claim_pdf_preview_job');
    expect(originalMigration).toContain('for update skip locked');
    expect(providerMigration).toContain("storage_provider text not null default 'supabase'");
    expect(providerMigration).toContain('dp_queue_pdf_preview_v2');
    expect(providerMigration).toContain('dp_pdf_preview_storage_usage');
    expect(searchMigration).toContain('text_ready_at');
    expect(searchMigration).toContain('search_text');
    expect(searchMigration).toContain('dp_store_pdf_preview_text');
    expect(searchMigration).toContain('dp_search_pdf_preview');
    expect(worker).toContain("alt: 'media'");
    expect(worker).toContain("execFile('pdftoppm'");
    expect(worker).toContain("execFile('pdftotext'");
    expect(worker.indexOf('if (!readyPages.has(1)) {')).toBeLessThan(worker.indexOf('for (let start = 2'));
    expect(worker).toContain('dp_store_pdf_preview_text');
    expect(worker).toContain("status: complete ? 'ready' : pagesReady > 0 ? 'partial' : 'processing'");
    expect(r2Worker).toContain('putPrivateR2Object');
    expect(r2Worker).toContain("await import('./pdf-preview-worker.mjs')");
    expect(queue).toContain('dp_resource_index');
    expect(queue).toContain('dp_queue_pdf_preview_v2');
    expect(queue).toContain('--storage-provider=');
    expect(prepare).toContain('Boolean(document.text_ready_at)');
    expect(batch).toContain("'all_large_pdfs'");
    expect(batch).toContain('loadLargePdfs');
    expect(batch).toContain('Boolean(existing.text_ready_at)');
    expect(workflow).toContain('- all_large_pdfs');
    expect(workflow).toContain("default: '10'");
    expect(workflow).toContain("default: '8'");
    expect(dockerfile).toContain('poppler-utils');
    expect(dockerfile).toContain('COPY --from=builder /app/scripts ./scripts');
  });

  it('restores framing protection because PDF preview no longer uses an iframe', () => {
    const config = read('next.config.mjs');
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("X-Frame-Options', value: 'DENY'");
    expect(config).not.toContain('SAMEORIGIN');
  });
});

describe('PDF range route integrity', () => {
  it('normalizes beginning, middle, open-ended, and suffix ranges', () => {
    const beginning = parseSingleByteRange('bytes=0-1023', 10_000);
    const middle = parseSingleByteRange('bytes=4096-8191', 10_000);
    const openEnded = parseSingleByteRange('bytes=9000-', 10_000);
    const suffix = parseSingleByteRange('bytes=-500', 10_000);

    expect(beginning).toMatchObject({ kind: 'range', start: 0, end: 1023, header: 'bytes=0-1023' });
    expect(middle).toMatchObject({ kind: 'range', start: 4096, end: 8191, header: 'bytes=4096-8191' });
    expect(openEnded).toMatchObject({ kind: 'range', start: 9000, end: 9999, header: 'bytes=9000-9999' });
    expect(suffix).toMatchObject({ kind: 'range', start: 9500, end: 9999, header: 'bytes=9500-9999' });
    expect(byteRangeLength(beginning)).toBe(1024);
    expect(expectedPdfContentRange(middle, 10_000)).toBe('bytes 4096-8191/10000');
  });

  it('rejects invalid and oversized requests', () => {
    for (const value of ['bytes=0-1,3-4', 'items=0-1', 'bytes=10000-10001', 'bytes=20-10', 'bytes=-0']) {
      expect(parseSingleByteRange(value, 10_000)).toMatchObject({ kind: 'invalid', total: 10_000 });
    }
    const oversized = parseSingleByteRange('bytes=0-33554432', 50_000_000);
    expect(byteRangeLength(oversized)).toBe(33_554_433);
    expect(read('app/api/resource/[fileId]/pdf-content/route.ts')).toContain('MAX_RANGE_BYTES = 32 * 1024 * 1024');
  });

  it('requires exact upstream 206, Content-Range, and Content-Length semantics', () => {
    const decision = parseSingleByteRange('bytes=100-199', 1000);
    const good = new Response(new Uint8Array(100), { status: 206, headers: { 'content-range': 'bytes 100-199/1000', 'content-length': '100' } });
    const ignored = new Response(null, { status: 200, headers: { 'content-length': '1000' } });
    const wrongRange = new Response(null, { status: 206, headers: { 'content-range': 'bytes 0-99/1000', 'content-length': '100' } });
    const wrongLength = new Response(null, { status: 206, headers: { 'content-range': 'bytes 100-199/1000', 'content-length': '99' } });

    expect(validatePdfRangeUpstream(decision, 1000, good)).toBeNull();
    expect(validatePdfRangeUpstream(decision, 1000, ignored)).toBe('status');
    expect(validatePdfRangeUpstream(decision, 1000, wrongRange)).toBe('content-range');
    expect(validatePdfRangeUpstream(decision, 1000, wrongLength)).toBe('content-length');
  });

  it('keeps missing, wrong-file, and expired preview authorization fail-closed', () => {
    const previousSecret = process.env.PDF_PREVIEW_SESSION_SECRET;
    process.env.PDF_PREVIEW_SESSION_SECRET = 'test-only-preview-secret';
    try {
      const now = Date.UTC(2026, 6, 14, 0, 0, 0);
      const created = createPdfPreviewSession({
        fileId: 'drive-file-1',
        fileName: 'large.pdf',
        mimeType: 'application/pdf',
        size: 50_000_000,
        modifiedTime: '2026-07-14T00:00:00.000Z',
        userId: 'user-1',
        previewId: '00000000-0000-4000-8000-000000000001',
        previewVersionKey: 'a'.repeat(64),
        previewStorageProvider: 'r2',
        previewStorageBucket: 'dp-pdf-previews',
        previewStoragePrefix: `drive-file-1/${'a'.repeat(64)}`,
      }, now);
      expect(verifyPdfPreviewSession(null, 'drive-file-1', now)).toBeNull();
      expect(verifyPdfPreviewSession(created.token, 'another-file', now)).toBeNull();
      expect(verifyPdfPreviewSession(created.token, 'drive-file-1', now + (2 * 60 * 60 * 1000) + 1)).toBeNull();
      const verified = verifyPdfPreviewSession(created.token, 'drive-file-1', now);
      expect(verified?.previewVersionKey).toBe('a'.repeat(64));
      expect(verified?.previewStorageProvider).toBe('r2');
      expect(verified?.previewStorageBucket).toBe('dp-pdf-previews');
    } finally {
      if (previousSecret === undefined) delete process.env.PDF_PREVIEW_SESSION_SECRET;
      else process.env.PDF_PREVIEW_SESSION_SECRET = previousSecret;
    }
    expect(read('app/api/resource/[fileId]/pdf-content/route.ts')).toContain('status: 401');
  });
});

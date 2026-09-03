import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('private PDF preview derivatives', () => {
  it('keeps PDF support while using an integrated continuous reader', () => {
    const preview = read('app/resource/[fileId]/resource-preview.tsx');
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(preview).toContain('<PdfViewer fileId={fileId} name={name} />');
    expect(viewer).toContain("fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-session`");
    expect(viewer).toContain('ContinuousPdfReader');
  });

  it('provides one compact toolbar with direct navigation and document controls', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    for (const marker of [
      'Previous page',
      'Next page',
      'Zoom out',
      'Zoom in',
      'Fit width',
      'Print PDF',
      'Search document',
    ]) {
      expect(viewer).toContain(marker);
    }
  });

  it('keeps annotations private to the browser with undo, redo, pen, highlight and erase', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    for (const marker of [
      'Undo annotation',
      'Redo annotation',
      'Pen',
      'Highlight',
      'Eraser',
      'localStorage',
    ]) {
      expect(viewer).toContain(marker);
    }
  });

  it('removes the duplicate PDF download and doubled fallback strip', () => {
    const preview = read('app/resource/[fileId]/resource-preview.tsx');
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(preview).not.toContain('Download PDF');
    expect(viewer).not.toContain('Open original PDF');
  });

  it('authorizes once and serves private same-origin manifests, search and page images', () => {
    const sessionRoute = read('app/api/resource/[fileId]/pdf-session/route.ts');
    const statusRoute = read(
      'app/api/resource/[fileId]/pdf-preview/status/route.ts',
    );
    const manifestRoute = read(
      'app/api/resource/[fileId]/pdf-preview/manifest/route.ts',
    );
    const searchRoute = read(
      'app/api/resource/[fileId]/pdf-preview/search/route.ts',
    );
    const pageRoute = read(
      'app/api/resource/[fileId]/pdf-preview/page/[pageNumber]/route.ts',
    );
    const token = read('lib/pdf-preview-session.ts');

    expect(sessionRoute).toContain('requireMember');
    expect(sessionRoute).toContain('recordFileOpenedOnce');
    expect(sessionRoute).toContain('getPdfPreviewDocument');
    expect(sessionRoute).not.toContain('ensurePdfPreviewDocument');
    expect(sessionRoute).toContain('assertInsideRoot');
    expect(sessionRoute).toContain('getDriveMetadata');
    expect(sessionRoute).toContain('getIndexedResourceCore');
    expect(sessionRoute).not.toContain('getIndexedResourceShell');
    expect(sessionRoute).toContain(
      'previewStorageProvider: preview.storage_provider',
    );
    expect(sessionRoute).toContain('HttpOnly');
    expect(sessionRoute).toContain('SameSite=Lax');
    expect(token).toContain('pdfPreviewSessionFromRequest');
    expect(token).toContain("previewStorageProvider: 'supabase' | 'r2'");
    for (const route of [statusRoute, manifestRoute, searchRoute, pageRoute])
      expect(route).toContain('pdfPreviewSessionFromRequest');
    expect(searchRoute).toContain("url.searchParams.get('v')");
    expect(searchRoute).toContain('dp_search_pdf_preview');
    expect(searchRoute).toContain('findPdfSearchMatches');
    expect(searchRoute).toContain('search/page-${pageNumber}.json');
  });

  it('uses private provider metadata and resumable image plus text preparation', () => {
    const derivatives = read('lib/pdf-preview-derivatives.ts');
    const prepare = read('scripts/prepare-pdf-preview.mjs');
    expect(derivatives).toContain('storage_provider');
    expect(derivatives).toContain('storage_bucket');
    expect(derivatives).toContain('storage_prefix');
    expect(prepare).toContain('pagesReady');
    expect(prepare).toContain('textReady');
  });

  it('restores framing protection because PDF preview no longer uses an iframe', () => {
    const middleware = read('middleware.ts');
    expect(middleware).toContain("frame-ancestors 'none'");
  });
});

describe('PDF range route integrity', () => {
  it('normalizes beginning, middle, open-ended, and suffix ranges', () => {
    const source = read('lib/range-requests.ts');
    expect(source).toContain('parseSingleByteRange');
    expect(source).toContain("spec.startsWith('-')");
    expect(source).toContain("spec.endsWith('-')");
  });

  it('rejects invalid and oversized requests', () => {
    const source = read('lib/range-requests.ts');
    expect(source).toContain("kind: 'invalid'");
    expect(source).toContain('MAX_RANGE_BYTES');
  });

  it('requires exact upstream 206, Content-Range, and Content-Length semantics', () => {
    const route = read('app/api/resource/[fileId]/content/route.ts');
    const media = read('lib/media-range.ts');
    expect(route).toContain("rangeDecision.kind === 'range'");
    expect(media).toContain('content-range');
    expect(media).toContain('content-length');
  });

  it('keeps missing, wrong-file, and expired preview authorization fail-closed', () => {
    const token = read('lib/pdf-preview-session.ts');
    expect(token).toContain('expiresAt');
    expect(token).toContain('fileId');
    expect(token).toContain('userId');
  });
});

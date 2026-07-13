import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getResourceCapability } from '../lib/resource-capabilities';

const read = (path: string) => readFileSync(path, 'utf8');

describe('progressive PDF preview', () => {
  it('enables byte ranges for PDF resources', () => {
    const capability = getResourceCapability('application/pdf', 'large-book.pdf');
    expect(capability.previewMode).toBe('pdf');
    expect(capability.needsRange).toBe(true);
  });

  it('uses a single authenticated session followed by locally verified PDF requests', () => {
    const preview = read('app/resource/[fileId]/resource-preview.tsx');
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    const sessionRoute = read('app/api/resource/[fileId]/pdf-session/route.ts');
    const contentRoute = read('app/api/resource/[fileId]/pdf-content/route.ts');
    const token = read('lib/pdf-preview-session.ts');

    expect(preview).toContain("import { PdfViewer } from './pdf-viewer'");
    expect(viewer).toContain('/pdf-session');
    expect(viewer).toContain("'x-dp-pdf-session': session.token");
    expect(sessionRoute).toContain('requireMember()');
    expect(sessionRoute).toContain('createPdfPreviewSession');
    expect(contentRoute).toContain('verifyPdfPreviewSession');
    expect(contentRoute).not.toContain('requireMember');
    expect(contentRoute).not.toContain('getIndexedResourceShell');
    expect(contentRoute).not.toContain('rateLimit(');
    expect(token).toContain("createHmac('sha256'");
    expect(token).toContain('timingSafeEqual');
  });

  it('streams normal large PDFs and uses larger range chunks', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(viewer).toContain('STREAMING_LIMIT = 128 * 1024 * 1024');
    expect(viewer).toContain('DEFAULT_RANGE_CHUNK = 8 * 1024 * 1024');
    expect(viewer).toContain('LARGE_RANGE_CHUNK = 16 * 1024 * 1024');
    expect(viewer).toContain('disableStream: rangeOnly');
    expect(viewer).toContain('disableAutoFetch: rangeOnly');
    expect(viewer).toContain('loadingTask.onProgress');
    expect(viewer).not.toContain('rangeChunkSize: 2 * 1024 * 1024');
  });

  it('caps signed range size and keeps sessions short-lived and file-specific', () => {
    const route = read('app/api/resource/[fileId]/pdf-content/route.ts');
    const token = read('lib/pdf-preview-session.ts');
    expect(route).toContain('MAX_RANGE_BYTES = 32 * 1024 * 1024');
    expect(route).toContain("req.headers.get('x-dp-pdf-session')");
    expect(token).toContain("payload.fileId !== expectedFileId");
    expect(token).toContain('SESSION_TTL_SECONDS = 2 * 60 * 60');
    expect(token).toContain("audience: 'pdf-preview'");
  });

  it('keeps essential controls, cleanup, and one activity event per open', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    const sessionRoute = read('app/api/resource/[fileId]/pdf-session/route.ts');
    expect(viewer).toContain('PDF page number');
    expect(viewer).toContain('Zoom in');
    expect(viewer).toContain('Full screen');
    expect(viewer).toContain('Retry preview');
    expect(viewer).toContain('loadingTask.destroy()');
    expect(viewer).toContain('renderTask?.cancel()');
    expect(sessionRoute).toContain('recordFileOpenedOnce');
  });

  it('retains protection for the general content and open routes', () => {
    const contentRoute = read('app/api/resource/[fileId]/content/route.ts');
    const openRoute = read('app/api/files/[fileId]/open/route.ts');
    for (const route of [contentRoute, openRoute]) {
      expect(route).toContain('recordFileOpenedOnce');
      expect(route).toContain('auditOpen();');
    }
  });
});

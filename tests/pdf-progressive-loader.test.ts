import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getResourceCapability } from '../lib/resource-capabilities';

const read = (path: string) => readFileSync(path, 'utf8');

describe('progressive PDF preview', () => {
  it('enables authenticated byte ranges for PDF resources', () => {
    const capability = getResourceCapability('application/pdf', 'large-book.pdf');
    expect(capability.previewMode).toBe('pdf');
    expect(capability.needsRange).toBe(true);
  });

  it('uses PDF.js range loading instead of downloading a complete blob', () => {
    const preview = read('app/resource/[fileId]/resource-preview.tsx');
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(preview).toContain("import { PdfViewer } from './pdf-viewer'");
    expect(viewer).toContain("import('pdfjs-dist/webpack.mjs')");
    expect(viewer).toContain('disableRange: false');
    expect(viewer).toContain('disableStream: true');
    expect(viewer).toContain('disableAutoFetch: true');
    expect(viewer).toContain('rangeChunkSize: 2 * 1024 * 1024');
    expect(viewer).toContain('loadingTask.onProgress');
    expect(viewer).toContain('actual PDF bytes fetched');
    expect(preview).not.toContain('const blob = await res.blob()');
    expect(preview).not.toContain('URL.createObjectURL(blob)');
  });

  it('keeps essential controls and cleanup for very large documents', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(viewer).toContain('PDF page number');
    expect(viewer).toContain('Zoom in');
    expect(viewer).toContain('Full screen');
    expect(viewer).toContain('Retry preview');
    expect(viewer).toContain('loadingTask.destroy()');
    expect(viewer).toContain('renderTask?.cancel()');
  });

  it('gives range traffic a separate high-volume rate budget', () => {
    const route = read('app/api/resource/[fileId]/content/route.ts');
    expect(route).toContain("const rateScope = isRangeRequest ? 'resource-content-range' : 'resource-content'");
    expect(route).toContain('isRangeRequest ? 600 : 120');
    expect(route).toContain('10 * 60 * 1000');
  });

  it('records successful full and range opens without logging every chunk', () => {
    const activity = read('lib/activity.ts');
    const contentRoute = read('app/api/resource/[fileId]/content/route.ts');
    const openRoute = read('app/api/files/[fileId]/open/route.ts');
    expect(activity).toContain('recordFileOpenedOnce');
    expect(activity).toContain("'file-open-audit'");
    expect(activity).toContain('15 * 1000');
    for (const route of [contentRoute, openRoute]) {
      expect(route).toContain('recordFileOpenedOnce');
      expect(route).toContain('auditOpen();');
      expect(route.indexOf('auditOpen();')).toBeLessThan(route.lastIndexOf('return native.status'));
    }
  });
});

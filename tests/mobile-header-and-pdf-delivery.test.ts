import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const header = readFileSync('components/app-header.tsx', 'utf8');
const contentRoute = readFileSync(
  'app/api/resource/[fileId]/content/route.ts',
  'utf8',
);
const mediaRange = readFileSync('lib/media-range.ts', 'utf8');
const driveMediaFast = readFileSync('lib/drive-media-fast.ts', 'utf8');
const toaster = readFileSync('components/sonner-provider.tsx', 'utf8');

describe('mobile DP Resources header', () => {
  it('keeps the desktop wordmark inside a separately hidden wrapper', () => {
    expect(header).toContain('<div className="hidden shrink-0 sm:block">');
    expect(header).toContain('<BrandMark className="size-10" />');
    expect(header).toContain('className="text-base sm:text-lg"');
    expect(header).not.toContain(
      'className="hidden shrink-0 text-base sm:inline-flex sm:text-lg"',
    );
  });
});

describe('report trigger presentation', () => {
  it('colors only resource and question report trigger buttons red', () => {
    expect(toaster).toContain("button[aria-label^='Report issue with ']");
    expect(toaster).toContain('background: #fff1f2 !important');
    expect(toaster).toContain("html[data-theme='dark']");
    expect(toaster).toContain('background: #351720 !important');
    expect(toaster).not.toContain("button[aria-label^='Share '");
  });
});

describe('standard PDF delivery', () => {
  it('uses native Drive delivery with a bounded buffered fallback', () => {
    expect(contentRoute).toContain('function isPdfResource');
    expect(contentRoute).toContain(
      'if (!requestedRange && isPdfResource(meta.mimeType, meta.name))',
    );
    expect(contentRoute).toContain('fetchDriveMediaResponse(');
    expect(contentRoute).toContain('readBufferedPdfFallback(');
    expect(contentRoute).toContain('MAX_BUFFERED_PDF_FALLBACK_BYTES');
    expect(contentRoute).toContain("headers.set('x-pdf-delivery', 'buffered-fallback')");
    expect(contentRoute).toContain('All Google Drive PDF delivery paths failed');
    expect(contentRoute).toContain("'x-file-size'");
  });

  it('retries stalled or rejected Drive reads without changing range support', () => {
    expect(driveMediaFast).toContain('DRIVE_HEADER_TIMEOUT_MS');
    expect(driveMediaFast).toContain('controller.abort()');
    expect(mediaRange).toContain('getDriveMediaFetch(fileId, range)');
    expect(mediaRange).toContain('DRIVE_FALLBACK_TIMEOUT_MS');
    expect(contentRoute).toContain("rangeDecision.kind === 'range'");
    expect(contentRoute).toContain('getDriveStream(');
    expect(contentRoute).toContain(
      'Preview is unavailable for this Google Workspace file type.',
    );
  });
});

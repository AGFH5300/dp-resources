import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const header = readFileSync('components/app-header.tsx', 'utf8');
const contentRoute = readFileSync(
  'app/api/resource/[fileId]/content/route.ts',
  'utf8',
);

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

describe('standard PDF delivery', () => {
  it('uses the native Drive fetch stream for complete PDF responses', () => {
    expect(contentRoute).toContain('function isPdfResource');
    expect(contentRoute).toContain(
      'if (!requestedRange && isPdfResource(meta.mimeType, meta.name))',
    );
    expect(contentRoute).toContain('fetchDriveMediaResponse(');
    expect(contentRoute).toContain('Google Drive PDF fetch failed');
    expect(contentRoute).toContain("'x-file-size'");
  });

  it('retains the existing range and workspace export paths', () => {
    expect(contentRoute).toContain('rangeDecision.kind === \'range\'');
    expect(contentRoute).toContain('getDriveStream(');
    expect(contentRoute).toContain(
      'Preview is unavailable for this Google Workspace file type.',
    );
  });
});

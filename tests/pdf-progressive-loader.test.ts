import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getResourceCapability } from '../lib/resource-capabilities';

const read = (path: string) => readFileSync(path, 'utf8');

describe('native progressive PDF preview', () => {
  it('keeps PDF byte-range support enabled', () => {
    const capability = getResourceCapability('application/pdf', 'large-book.pdf');
    expect(capability.previewMode).toBe('pdf');
    expect(capability.needsRange).toBe(true);
  });

  it('uses the native browser reader after a verified partial-content probe', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    expect(viewer).toContain('<iframe');
    expect(viewer).toContain("Range: 'bytes=0-1023'");
    expect(viewer).toContain('probe.status !== 206');
    expect(viewer).not.toContain("import('pdfjs-dist");
    expect(viewer).not.toContain('<canvas');
  });

  it('uses a file-scoped HttpOnly session cookie', () => {
    const sessionRoute = read('app/api/resource/[fileId]/pdf-session/route.ts');
    const contentRoute = read('app/api/resource/[fileId]/pdf-content/route.ts');
    const token = read('lib/pdf-preview-session.ts');

    expect(sessionRoute).toContain('set-cookie');
    expect(sessionRoute).toContain('HttpOnly');
    expect(sessionRoute).toContain('SameSite=Lax');
    expect(token).toContain('pdfPreviewSessionCookieName');
    expect(token).toContain('pdfPreviewSessionCookiePath');
    expect(contentRoute).toContain('pdfPreviewSessionCookieName');
    expect(contentRoute).toContain('verifyPdfPreviewSession');
    expect(contentRoute).not.toContain('requireMember');
  });

  it('reuses Google authorization across range requests and rejects ignored ranges', () => {
    const fastMedia = read('lib/drive-media-fast.ts');
    const mediaRange = read('lib/media-range.ts');
    const contentRoute = read('app/api/resource/[fileId]/pdf-content/route.ts');

    expect(fastMedia).toContain('cachedAuth');
    expect(fastMedia).toContain('tokenRefresh');
    expect(fastMedia).toContain('credentials.access_token');
    expect(mediaRange).toContain('getFastDriveMediaFetch');
    expect(contentRoute).toContain('upstream.status !== 206');
    expect(contentRoute).toContain('Google Drive ignored a PDF byte range');
  });

  it('allows same-origin API framing while retaining page-level frame protection', () => {
    const config = read('next.config.mjs');
    expect(config).toContain('SAMEORIGIN');
    expect(config).toContain('DENY');
    expect(config.indexOf("source: '/api/:path*'")).toBeGreaterThan(config.indexOf("source: '/(.*)'"));
  });
});

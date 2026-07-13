import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getResourceCapability } from '../lib/resource-capabilities';

const read = (path: string) => readFileSync(path, 'utf8');

describe('native progressive PDF preview', () => {
  it('enables byte ranges for PDF resources', () => {
    const capability = getResourceCapability('application/pdf', 'large-book.pdf');
    expect(capability.previewMode).toBe('pdf');
    expect(capability.needsRange).toBe(true);
  });

  it('uses one authenticated setup request and an HttpOnly file-scoped cookie', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    const sessionRoute = read('app/api/resource/[fileId]/pdf-session/route.ts');
    const token = read('lib/pdf-preview-session.ts');

    expect(viewer).toContain('/pdf-session');
    expect(viewer).toContain('<iframe');
    expect(sessionRoute).toContain("'set-cookie': cookie");
    expect(sessionRoute).toContain("'HttpOnly'");
    expect(sessionRoute).toContain("'SameSite=Lax'");
    expect(sessionRoute).not.toContain('token: session.token');
    expect(token).toContain('pdfPreviewSessionCookieName');
    expect(token).toContain('pdfPreviewSessionCookiePath');
    expect(token).toContain("createHmac('sha256'");
    expect(token).toContain('timingSafeEqual');
  });

  it('verifies a real byte range before revealing the native reader', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');
    const contentRoute = read('app/api/resource/[fileId]/pdf-content/route.ts');

    expect(viewer).toContain("Range: 'bytes=0-1023'");
    expect(viewer).toContain('probe.status !== 206');
    expect(viewer).toContain("probe.headers.get('content-range')");
    expect(contentRoute).toContain('upstream.status !== 206');
    expect(contentRoute).toContain('Google Drive ignored a PDF byte range');
    expect(contentRoute).toContain('MAX_RANGE_BYTES = 32 * 1024 * 1024');
  });

  it('caches the Google auth client and access token across range requests', () => {
    const fastMedia = read('lib/drive-media-fast.ts');
    const mediaRange = read('lib/media-range.ts');

    expect(fastMedia).toContain('let cachedAuth');
    expect(fastMedia).toContain('let tokenRefresh');
    expect(fastMedia).toContain('auth.credentials.access_token');
    expect(fastMedia).toContain('auth.credentials.expiry_date');
    expect(fastMedia).toContain("...(range ? { Range: range } : {})");
    expect(mediaRange).toContain('getFastDriveMediaFetch');
    expect(mediaRange).not.toContain('getDriveMediaFetch');
  });

  it('uses the browser native continuous reader instead of PDF.js canvases', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');

    expect(viewer).toContain('<iframe');
    expect(viewer).toContain('allowFullScreen');
    expect(viewer).toContain('referrerPolicy="no-referrer"');
    expect(viewer).not.toContain("import('pdfjs-dist");
    expect(viewer).not.toContain('ContinuousPdfPage');
    expect(viewer).not.toContain('<canvas');
    expect(viewer).not.toContain('Downloaded ');
    expect(viewer).not.toContain('remaining');
  });

  it('allows same-origin API embedding while keeping pages protected', () => {
    const config = read('next.config.mjs');
    const pageRule = config.indexOf("source: '/(.*)'");
    const apiRule = config.indexOf("source: '/api/:path*'");

    expect(config).toContain('apiSecurityHeaders = securityHeaders("\'self\'", \'SAMEORIGIN\')');
    expect(config).toContain('pageSecurityHeaders = securityHeaders("\'none\'", \'DENY\')');
    expect(pageRule).toBeGreaterThanOrEqual(0);
    expect(apiRule).toBeGreaterThan(pageRule);
  });

  it('keeps content authorization local and records one activity event', () => {
    const sessionRoute = read('app/api/resource/[fileId]/pdf-session/route.ts');
    const contentRoute = read('app/api/resource/[fileId]/pdf-content/route.ts');

    expect(sessionRoute).toContain('requireMember()');
    expect(sessionRoute).toContain('recordFileOpenedOnce');
    expect(contentRoute).toContain('verifyPdfPreviewSession');
    expect(contentRoute).toContain('pdfPreviewSessionCookieName');
    expect(contentRoute).not.toContain('requireMember');
    expect(contentRoute).not.toContain('getIndexedResourceShell');
    expect(contentRoute).not.toContain('rateLimit(');
  });
});

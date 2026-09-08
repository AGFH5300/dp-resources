import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('resource content first-load reliability', () => {
  it('buffers whole-file previews and retries transient upstream failures before responding', () => {
    const route = read(
      'app/api/resource/[fileId]/buffered-content/route.ts',
    );

    expect(route).toContain("import { GET as getContent } from '../content/route'");
    expect(route).toContain('const MAX_ATTEMPTS = 3');
    expect(route).toContain('new Set([502, 503, 504])');
    expect(route).toContain('await response.arrayBuffer()');
    expect(route).toContain("headers.set('x-content-delivery', 'buffered-retry')");
    expect(route).toContain('MAX_BUFFERED_RESOURCE_BYTES = 64 * 1024 * 1024');
    expect(route).toContain("headers.set('x-content-delivery', 'streamed-large')");
  });

  it('keeps range media on the original streaming route', () => {
    const route = read(
      'app/api/resource/[fileId]/buffered-content/route.ts',
    );

    expect(route).toContain("if (req.headers.has('range')) return getContent(req, context)");
  });

  it('routes full-file browser previews through buffered delivery while leaving media streaming', () => {
    const preview = read('app/resource/[fileId]/resource-preview.tsx');

    expect(preview).toContain('const bufferedUrl = `/api/resource/${fileId}/buffered-content`');
    expect(preview).toContain('<PdfViewer url={bufferedUrl}');
    expect(preview).toContain('<WorkbookPreview url={bufferedUrl}');
    expect(preview).toContain('<DocxPreview url={bufferedUrl} />');
    expect(preview).toContain('<PresentationViewer url={bufferedUrl}');
    expect(preview).toContain('<ImagePreview url={streamUrl}');
    expect(preview).toContain('kind="audio" url={streamUrl}');
    expect(preview).toContain('kind="video" url={streamUrl}');
  });

  it('uses buffered delivery for standard PDF fallback sessions', () => {
    const route = read('app/api/resource/[fileId]/pdf-session/route.ts');
    expect(route).toContain(
      'standardUrl: `/api/resource/${encodeURIComponent(fileId)}/buffered-content`',
    );
  });
});

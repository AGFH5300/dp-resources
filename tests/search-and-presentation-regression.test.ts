import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(path, 'utf8');

describe('search consistency and PPTX viewer regressions', () => {
  it('normalizes filename and MIME separators in the generated search vector without ILIKE fallback', () => {
    const sql = read('supabase/migrations/20260707184500_separator_normalized_resource_search_vector.sql');
    expect(sql).not.toMatch(/regexp_replace/i);
    expect(sql).not.toContain('concat_ws');
    expect(sql).toContain('to_tsvector(');
    expect(sql).toContain("'simple'");
    expect(sql).toContain("coalesce(name,'') || ' ' ||");
    expect(sql).toContain("coalesce(path,'') || ' ' ||");
    expect(sql).toContain("coalesce(mime_type,'') || ' ' ||");
    for (const separator of ['.', '/', '_', '-', ':', ',', ';', '(', ')', '[', ']', '{', '}']) {
      expect(sql).toContain(`'${separator}', ' '`);
    }
    for (const term of ['mp4', 'pdf', 'docx', 'pptx', 'xlsx', 'mp3', 'png']) {
      expect([`en.${term}`, `video/${term}`, `some_file-name.${term}`, `chemistry:hl.${term}`].map(value =>
        ['.', '/', '_', '-', ':', ',', ';', '(', ')', '[', ']', '{', '}'].reduce(
          (normalized, separator) => normalized.replaceAll(separator, ' '),
          value,
        ).split(/\s+/),
      ).every(tokens => tokens.includes(term))).toBe(true);
    }
    expect(sql).toContain('using gin (search_vector)');
    expect(read('supabase/migrations/20260707143000_token_search_resources_rpc.sql')).not.toMatch(/ilike/i);
  });

  it('global search uses monotonic request ownership, aborts, timeout, and retry without query edits', () => {
    const source = read('components/global-search.tsx');
    expect(source).toContain('requestSeq=useRef(0)');
    expect(source).toContain('const seq=++requestSeq.current');
    expect(source).toContain('requestSeq.current!==seq');
    expect(source).toContain('setTimeout(() => ac.abort');
    expect(source).toContain('7000');
    expect(source).toContain('setRetryNonce(n=>n+1)');
    expect(source).toContain('Search timed out. Please retry.');
  });

  it('PPTX viewer uses the authenticated content endpoint, client renderer, cleanup controls, and no server PDF polling', () => {
    const resourcePreview = read('app/resource/[fileId]/resource-preview.tsx');
    const viewer = read('app/resource/[fileId]/presentation-viewer.tsx');
    expect(resourcePreview).toContain('return <PresentationViewer url={url} fileId={fileId} name={name} />');
    expect(resourcePreview).not.toContain('PresentationViewer url={`/api/resource/${fileId}/presentation-pdf`}');
    expect(viewer).toContain("fetch(url, { credentials: 'same-origin', signal: controller.signal })");
    expect(viewer).toContain("import('@vue-office/pptx')");
    expect(viewer).toContain("import('vue')");
    expect(viewer).toContain("import('@/lib/pptx-audio')");
    expect(viewer).toContain('extractPptxAudioBlobs(buffer)');
    expect(viewer).toContain('AbortController');
    expect(viewer).toContain('60_000');
    expect(viewer).toContain('30_000');
    expect(viewer).toContain('PresentationErrorBoundary');
    expect(viewer).toContain('Retry preview');
    expect(viewer).toContain('Download presentation');
    expect(viewer).toContain('URL.createObjectURL(item.blob)');
    expect(viewer).toContain('revokeObjectUrls(attemptUrls)');
    expect(viewer).toContain('mountedApp.unmount()');
    expect(viewer).toContain('DOMPurify.default.sanitize');
    expect(viewer).toContain('noopener noreferrer');
    expect(viewer).toContain('if (nodes.length === 0)');
    expect(viewer).not.toContain("import('pdfjs-dist')");
    expect(viewer).not.toContain('res.status === 202');
    expect(viewer).not.toContain('await wait(2000)');
    expect(viewer).not.toContain('<iframe');
  });

  it('PPTX loading reports real bytes and never invents a rendering percentage', () => {
    const viewer = read('app/resource/[fileId]/presentation-viewer.tsx');
    expect(viewer).toContain('readResponseWithProgress(response');
    expect(viewer).toContain('loaded += value.byteLength');
    expect(viewer).toContain('onProgress(loaded, total)');
    expect(viewer).toContain('setDownloadedBytes(loaded)');
    expect(viewer).toContain('setDownloadTotal(total)');
    expect(viewer).toContain('setRenderedSlides(root.current.querySelectorAll');
    expect(viewer).toContain('Slide rendering does not expose a percentage');
    expect(viewer).not.toContain('progress={pages ? 100 : 45}');
  });

  it('PPTX post-processing removes undefined text and isolates the selected slide', () => {
    const viewer = read('app/resource/[fileId]/presentation-viewer.tsx');
    expect(viewer).toContain('removeRendererTextArtifacts(root.current)');
    expect(viewer).toContain("span.textContent?.trim() === 'undefined'");
    expect(viewer).toContain('showOnlyActiveSlide(nodes, 1)');
    expect(viewer).toContain('showOnlyActiveSlide(slideNodes.current, page)');
    expect(viewer).toContain('const active = index + 1 === activePage');
    expect(viewer).not.toContain('Math.abs(index + 1 - page) <= 1');
  });

  it('PPTX viewer supports selecting slides and bounded left/right navigation', () => {
    const compact = read('app/resource/[fileId]/presentation-viewer.tsx').replace(/\s+/g, '');
    expect(compact).toContain('Array.from({length:pages||1}');
    expect(compact).toContain('onClick={()=>setPage(slide)}');
    expect(compact).toContain('Math.max(1,current-1)');
    expect(compact).toContain('Math.min(pages||1,current+1)');
    expect(compact).toContain('page>=pages');
  });

  it('permanently disables and removes the server-side PPTX converter', () => {
    const source = read('app/api/resource/[fileId]/presentation-pdf/route.ts');
    expect(source).toContain('await requireMember()');
    expect(source).toContain("status: 'disabled'");
    expect(source).toContain('status: 410');
    expect(source).toContain('permanently removed');
    expect(source).toContain("'cache-control': 'no-store'");
    expect(source).not.toContain('ENABLE_SERVER_PPTX_CONVERSION');
    expect(source).not.toContain('spawn');
    expect(source).not.toContain('soffice');
    expect(source).not.toContain('libreoffice');
    expect(source).not.toContain('startConversionInBackground');
  });
});

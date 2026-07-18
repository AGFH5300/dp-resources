import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('standard PDF fallback', () => {
  it('uses the completed resource index and never queues previews from a web request', () => {
    const route = read('app/api/resource/[fileId]/pdf-session/route.ts');

    expect(route).toContain(
      "import { getIndexedResourceShell } from '@/lib/indexed-resource'",
    );
    expect(route).toContain(
      'const indexedMeta = await getIndexedResourceShell(fileId)',
    );
    expect(route).toContain(
      'const meta = indexedMeta || await getDriveMetadata(fileId)',
    );
    expect(route).toContain('getPdfPreviewDocument');
    expect(route).not.toContain('ensurePdfPreviewDocument');
    expect(route).not.toContain('dp_queue_pdf_preview');
  });

  it('prioritizes completed preview pages and does not downgrade on lookup errors', () => {
    const derivatives = read('lib/pdf-preview-derivatives.ts');
    const route = read('app/api/resource/[fileId]/pdf-session/route.ts');

    expect(derivatives).toContain(
      'if (isPdfPreviewViewable(exact)) return exact',
    );
    expect(derivatives).toContain(
      'if (isPdfPreviewViewable(reusable)) return reusable',
    );
    expect(derivatives).toContain('return exact || reusable');
    expect(route).toContain(
      'PDF preview availability is temporarily unavailable.',
    );
    expect(route).not.toContain(
      "console.error('Unable to read PDF preview derivative', { fileId, error });\n    return null",
    );
  });

  it('returns standard mode immediately when no prepared page preview is viewable', () => {
    const route = read('app/api/resource/[fileId]/pdf-session/route.ts');

    expect(route).toContain("mode: 'standard'");
    expect(route).toContain(
      'standardUrl: `/api/resource/${encodeURIComponent(fileId)}/content`',
    );
    expect(route).toContain('if (!preview || !isPdfPreviewViewable(preview))');
    expect(route).toContain("mode: 'prepared'");
  });

  it('loads ordinary PDFs through a browser-local Blob reader instead of polling forever', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx');

    expect(viewer).toContain('function StandardPdfViewer');
    expect(viewer).toContain(
      "fetch(url,{credentials:'same-origin',cache:'no-store'",
    );
    expect(viewer).toContain(
      "if(!sourceBlob.size)throw new Error('PDF response was empty')",
    );
    expect(viewer).toContain("new Blob([sourceBlob],{type:'application/pdf'})");
    expect(viewer).toContain('URL.createObjectURL(blob)');
    expect(viewer).toContain('URL.revokeObjectURL(objectUrl)');
    expect(viewer).toContain(
      "if(next.mode==='standard'){setStandardUrl(next.standardUrl||url);return}",
    );
    expect(viewer).toContain("next.mode!=='prepared'||!next.manifestUrl");
    expect(viewer).toContain(
      'for(let sessionAttempt=0;sessionAttempt<2;sessionAttempt+=1)',
    );
    expect(viewer).toContain(
      "setError('The prepared PDF preview could not be opened.",
    );
    expect(viewer).not.toContain(
      'if(!response.ok){if(!stopped)setStandardUrl(url);return}',
    );
    expect(viewer).toContain('if(standardUrl)return <StandardPdfViewer');
    expect(viewer).not.toContain(
      'else timer=setTimeout(()=>void poll(url),4000)',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');

describe('search consistency and PPTX PDF viewer regressions',()=>{
  it('normalizes filename and MIME separators in the generated search vector without ILIKE fallback',()=>{
    const sql=read('supabase/migrations/20260707184500_separator_normalized_resource_search_vector.sql');
    expect(sql).toContain("regexp_replace(coalesce(name,''), '[^[:alnum:]]+', ' ', 'g')");
    expect(sql).toContain("regexp_replace(coalesce(mime_type,''), '[^[:alnum:]]+', ' ', 'g')");
    expect(sql).toContain('using gin (search_vector)');
    expect(read('supabase/migrations/20260707143000_token_search_resources_rpc.sql')).not.toMatch(/ilike/i);
  });
  it('global search uses monotonic request ownership, aborts, timeout, and retry without query edits',()=>{
    const s=read('components/global-search.tsx');
    expect(s).toContain('requestSeq=useRef(0)');
    expect(s).toContain('const seq=++requestSeq.current');
    expect(s).toContain('requestSeq.current!==seq');
    expect(s).toContain('setTimeout(() => ac.abort');
    expect(s).toContain('7000');
    expect(s).toContain('setRetryNonce(n=>n+1)');
    expect(s).toContain('Search timed out. Please retry.');
  });
  it('PPTX viewer uses PDF.js canvas rendering, real page count, and no iframe',()=>{
    const s=read('app/resource/[fileId]/resource-preview.tsx');
    const viewer=s.slice(s.indexOf('function PresentationViewer'), s.indexOf('function PdfViewer'));
    expect(viewer).toContain("import('pdfjs-dist')");
    expect(viewer).toContain('doc.numPages');
    expect(viewer).toContain('<canvas');
    expect(viewer).not.toContain('<iframe');
    expect(viewer).not.toContain('setPages(1)');
  });
  it('PPTX viewer supports selecting slide 5 and bounded left/right navigation',()=>{
    const viewer=read('app/resource/[fileId]/resource-preview.tsx').slice(read('app/resource/[fileId]/resource-preview.tsx').indexOf('function PresentationViewer'));
    expect(viewer).toContain('Array.from({length:maxPicker}');
    expect(viewer).toContain('onClick={()=>setPage(n)}');
    expect(viewer).toContain('Math.max(1,p-1)');
    expect(viewer).toContain('Math.min(pages||1,p+1)');
    expect(viewer).toContain('page>=pages');
  });
  it('conversion uses isolated LibreOffice profile, PDF header validation, timeout, and authenticated private ranges',()=>{
    const s=read('app/api/resource/[fileId]/presentation-pdf/route.ts');
    expect(s).toContain("mkdtemp(path.join(tmpdir(),'dp-pptx-profile-'))");
    expect(s).toContain('-env:UserInstallation=${pathToFileURL(profileDir).href}');
    expect(s).toContain("'pdf:impress_pdf_Export'");
    expect(s).toContain("toString('utf8')==='%PDF-'");
    expect(s).toContain('CONVERSION_TIMEOUT_MS=60_000');
    expect(s).toContain("'accept-ranges':'bytes'");
    expect(s).toContain('status:206');
    expect(s).toContain('status:416');
    expect(s).toContain("'vary':'Cookie'");
    expect(s).toContain('await requireMember()');
    expect(s).toContain('await assertInsideRoot(fileId)');
  });
});

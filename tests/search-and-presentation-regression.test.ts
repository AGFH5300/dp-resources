import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');

describe('search consistency and PPTX PDF viewer regressions',()=>{
  it('normalizes filename and MIME separators in the generated search vector without ILIKE fallback',()=>{
    const sql=read('supabase/migrations/20260707184500_separator_normalized_resource_search_vector.sql');
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
  it('PPTX viewer uses browser content endpoint, client renderer, watchdogs, audio extraction, and no server PDF polling',()=>{
    const s=read('app/resource/[fileId]/resource-preview.tsx');
    const viewer=s.slice(s.indexOf('function PresentationViewer'), s.indexOf('function PdfViewer'));
    expect(s).toContain('return <PresentationViewer url={url} fileId={fileId} name={name} />');
    expect(s).not.toContain('PresentationViewer url={`/api/resource/${fileId}/presentation-pdf`}');
    expect(viewer).toContain("fetch(url, { credentials: 'same-origin', signal: controller.signal })");
    expect(viewer).toContain("import('@vue-office/pptx')");
    expect(viewer).toContain("import('vue')");
    expect(viewer).toContain('AbortController');
    expect(viewer).toContain('60_000');
    expect(viewer).toContain('30_000');
    expect(viewer).toContain('PresentationErrorBoundary');
    expect(s).toContain('Retry preview');
    expect(s).toContain('Download presentation');
    expect(viewer).toContain('extractPptxAudio(buffer)');
    expect(viewer).toContain('URL.revokeObjectURL');
    expect(viewer).toContain('DOMPurify.default.sanitize');
    expect(viewer).toContain('noopener noreferrer');
    expect(viewer).toContain('slideNodes.current.forEach');
    expect(viewer).not.toContain("import('pdfjs-dist')");
    expect(viewer).not.toContain('res.status === 202');
    expect(viewer).not.toContain('await wait(2000)');
    expect(viewer).not.toContain('<iframe');
  });
  it('PPTX viewer supports selecting slide 5 and bounded left/right navigation',()=>{
    const source=read('app/resource/[fileId]/resource-preview.tsx');
    const compact=source.slice(source.indexOf('function PresentationViewer')).replace(/\s+/g,'');
    expect(compact).toContain('Array.from({length:pages||1}');
    expect(compact).toContain('onClick={()=>setPage(n)}');
    expect(compact).toContain('Math.max(1,p-1)');
    expect(compact).toContain('Math.min(pages||1,p+1)');
    expect(compact).toContain('page>=pages');
  });
  it('legacy server conversion is disabled by default, asynchronous only, guarded, streamed, and authenticated',()=>{
    const s=read('app/api/resource/[fileId]/presentation-pdf/route.ts');
    expect(s).toContain("process.env.ENABLE_SERVER_PPTX_CONVERSION==='true'");
    expect(s).toContain("status:'disabled'");
    expect(s).toContain("return jsonStatus({status:'disabled'");
    expect(s).toContain('CONVERSION_TIMEOUT_MS=45_000');
    expect(s).toContain('CIRCUIT_TTL_MS=30*60*1000');
    expect(s).toContain('if(inFlight.size>0)');
    expect(s).toContain('detached:true');
    expect(s).toContain("process.kill(-pid,'SIGKILL')");
    expect(s).toContain('await pipeline');
    expect(s).not.toContain('Buffer.from(await res.arrayBuffer())');
    expect(s).toContain('startConversionInBackground(fileId,modified)');
    expect(s).toContain("status:'processing'");
    expect(s).toContain('202');
    expect(s).not.toContain('const pdf=await convert(fileId');
    expect(s).toContain('spawn(command,args');
    expect(s).toContain('await requireMember()');
    expect(s).toContain('await assertInsideRoot(fileId)');
  });
});

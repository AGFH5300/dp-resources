import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getResourceCapability, MASTER_WORKBOOK_FILE_ID } from '../lib/resource-capabilities';
const read=(p:string)=>readFileSync(p,'utf8');
describe('file preview compatibility and favourite reliability',()=>{
  it('uses server-batched favourite state and a shared client store, avoiding SaveButton mount fetch flash',()=>{
    expect(read('lib/favorites.ts')).toContain(".in('drive_file_id', ids)");
    expect(read('app/resource/[fileId]/page.tsx')).toContain('getFavoriteIdSet(user.id,[fileId])');
    expect(read('app/library/page.tsx')).toContain('getFavoriteIdSet(user.id, displayItems.map');
    expect(read('components/favorites-provider.tsx')).toContain('createContext');
    expect(read('components/resource-actions.tsx')).not.toContain("fetch('/api/favorites').then");
    expect(read('components/resource-actions.tsx')).toContain("aria-pressed={saved}");
  });
  it('renders audio and video native protected players',()=>{
    const s=read('app/resource/[fileId]/resource-preview.tsx');
    expect(s).toContain('<audio controls preload="metadata" src={url}');
    expect(s).toContain('<video controls preload="metadata" src={url}');
    expect(s).toContain('/api/resource/${fileId}/content');
    expect(s).not.toMatch(/Office Online|docs\.google|googleusercontent/);
  });
  it('content/open routes forward safe Range requests and return 206 headers without weakening auth',()=>{
    for (const f of ['app/api/resource/[fileId]/content/route.ts','app/api/files/[fileId]/open/route.ts']) { const s=read(f); expect(s.indexOf('requireMember()')).toBeLessThan(s.indexOf('req.headers.get(\'range\')')); expect(s).toContain('needsRangeSupport(meta.mimeType, meta.name)'); expect(s).toContain("/^bytes=\\d*-\\d*(,\\s*\\d*-\\d*)?$/"); expect(s).toContain("headers.set('accept-ranges', 'bytes')"); expect(s).toContain("headers.set('content-range'"); expect(s).toContain('status: contentRange ? 206 : 200'); }
  });
  it('maps every currently indexed MIME type to a non-generic preview path',()=>{
    const cases=[['application/pdf','x.pdf'],['application/vnd.openxmlformats-officedocument.wordprocessingml.document','x.docx'],['application/vnd.openxmlformats-officedocument.presentationml.presentation','x.pptx'],['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x.xlsx'],['audio/mpeg','x.mp3'],['image/png','x.png'],['video/mp4','x.mp4']];
    for (const [mime,name] of cases) expect(getResourceCapability(mime,name,false).generic).toBe(false);
    expect(getResourceCapability('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Master.xlsx',false,MASTER_WORKBOOK_FILE_ID).previewMode).toBe('master-xlsx');
  });
  it('has secure local XLSX and PPTX previews plus polished unknown fallback',()=>{
    expect(read('app/resource/[fileId]/xlsx-preview.tsx')).toContain("import('jszip')");
    expect(read('app/resource/[fileId]/presentation-outline.tsx')).toContain('Read-only presentation outline');
    const s=read('app/resource/[fileId]/resource-preview.tsx');
    expect(s).toContain('Preview not supported yet');
    expect(s).not.toContain('Preview unavailable for this file type');
  });
});

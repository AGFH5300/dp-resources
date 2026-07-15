from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise RuntimeError(f'Expected source was not found in {path}')
    file.write_text(text.replace(old, new, 1))


replace_once(
    'lib/pdf-preview-derivatives.ts',
    """export async function getPdfPreviewDocument(source: Pick<PdfPreviewSource, 'fileId' | 'size' | 'modifiedTime'>) {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_pdf_preview_documents')
    .select(documentColumns)
    .eq('drive_file_id', source.fileId)
    .eq('version_key', pdfPreviewVersionKey(source))
    .maybeSingle();
  if (error) throw new Error(`Unable to read PDF preview state: ${error.message}`);
  if (data) return data as PdfPreviewDocument;
  return findReusablePdfPreviewDocument(sb, source);
}
""",
    """export async function getPdfPreviewDocument(source: Pick<PdfPreviewSource, 'fileId' | 'size' | 'modifiedTime'>) {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('dp_pdf_preview_documents')
    .select(documentColumns)
    .eq('drive_file_id', source.fileId)
    .eq('version_key', pdfPreviewVersionKey(source))
    .maybeSingle();
  if (error) throw new Error(`Unable to read PDF preview state: ${error.message}`);

  const exact = data as PdfPreviewDocument | null;
  if (isPdfPreviewViewable(exact)) return exact;

  const reusable = await findReusablePdfPreviewDocument(sb, source);
  if (isPdfPreviewViewable(reusable)) return reusable;
  return exact || reusable;
}
""",
)

replace_once(
    'app/api/resource/[fileId]/pdf-session/route.ts',
    """  const preview = await getPdfPreviewDocument({
    fileId,
    size,
    modifiedTime: meta.modifiedTime,
  }).catch((error) => {
    console.error('Unable to read PDF preview derivative', { fileId, error });
    return null;
  });

""",
    """  let preview;
  try {
    preview = await getPdfPreviewDocument({
      fileId,
      size,
      modifiedTime: meta.modifiedTime,
    });
  } catch (error) {
    console.error('Unable to read PDF preview derivative', { fileId, error });
    return new Response('PDF preview availability is temporarily unavailable.', {
      status: 503,
      headers: {
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

""",
)

replace_once(
    'app/resource/[fileId]/pdf-viewer.tsx',
    "useEffect(()=>{const controller=new AbortController();let stopped=false;setState(null);setManifest(null);setStandardUrl('');setFirstReady(false);setError('');setZoom(1);setRotation(0);currentRef.current=1;setCurrent(1);setActive(new Set([1]));void(async()=>{try{const response=await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-session`,{method:'POST',credentials:'same-origin',signal:controller.signal,cache:'no-store'});if(!response.ok){if(!stopped)setStandardUrl(url);return}const next=await response.json() as State;if(stopped)return;setState(next);if(next.mode==='standard'||!next.manifestUrl){setStandardUrl(next.standardUrl||url);return}await loadManifest(next.manifestUrl,controller.signal)}catch(reason){if(stopped||(reason instanceof DOMException&&reason.name==='AbortError'))return;setStandardUrl(url)}})();return()=>{stopped=true;controller.abort()}},[attempt,fileId,loadManifest,url]);",
    "useEffect(()=>{const controller=new AbortController();let stopped=false;const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));setState(null);setManifest(null);setStandardUrl('');setFirstReady(false);setError('');setZoom(1);setRotation(0);currentRef.current=1;setCurrent(1);setActive(new Set([1]));void(async()=>{let lastError:unknown=null;for(let sessionAttempt=0;sessionAttempt<2;sessionAttempt+=1){try{const response=await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-session`,{method:'POST',credentials:'same-origin',signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error(`PDF session failed (${response.status})`);const next=await response.json() as State;if(stopped)return;setState(next);if(next.mode==='standard'){setStandardUrl(next.standardUrl||url);return}if(next.mode!=='prepared'||!next.manifestUrl)throw new Error('PDF session response was invalid');await loadManifest(next.manifestUrl,controller.signal);return}catch(reason){if(stopped||(reason instanceof DOMException&&reason.name==='AbortError'))return;lastError=reason;if(sessionAttempt===0)await wait(250)}}if(!stopped){console.error('Unable to open prepared PDF preview',{fileId,error:lastError});setError('The prepared PDF preview could not be opened. Retry the preview or download the original file.')}})();return()=>{stopped=true;controller.abort()}},[attempt,fileId,loadManifest,url]);",
)

replace_once(
    'tests/standard-pdf-fallback.test.ts',
    """    expect(viewer).toContain("next.mode==='standard'||!next.manifestUrl")
    expect(viewer).toContain('setStandardUrl(next.standardUrl||url)')
    expect(viewer).toContain('if(!response.ok){if(!stopped)setStandardUrl(url);return}')
    expect(viewer).toContain('if(standardUrl)return <StandardPdfViewer')
""",
    """    expect(viewer).toContain("if(next.mode==='standard'){setStandardUrl(next.standardUrl||url);return}")
    expect(viewer).toContain("next.mode!=='prepared'||!next.manifestUrl")
    expect(viewer).toContain('for(let sessionAttempt=0;sessionAttempt<2;sessionAttempt+=1)')
    expect(viewer).toContain("setError('The prepared PDF preview could not be opened.")
    expect(viewer).not.toContain('if(!response.ok){if(!stopped)setStandardUrl(url);return}')
    expect(viewer).toContain('if(standardUrl)return <StandardPdfViewer')
""",
)

standard_test = Path('tests/standard-pdf-fallback.test.ts')
text = standard_test.read_text()
anchor = """  it('returns standard mode immediately when no prepared page preview is viewable', () => {
"""
addition = """  it('prioritizes completed preview pages and does not downgrade on lookup errors', () => {
    const derivatives = read('lib/pdf-preview-derivatives.ts')
    const route = read('app/api/resource/[fileId]/pdf-session/route.ts')

    expect(derivatives).toContain('if (isPdfPreviewViewable(exact)) return exact')
    expect(derivatives).toContain('if (isPdfPreviewViewable(reusable)) return reusable')
    expect(derivatives).toContain('return exact || reusable')
    expect(route).toContain('PDF preview availability is temporarily unavailable.')
    expect(route).not.toContain("console.error('Unable to read PDF preview derivative', { fileId, error });\\n    return null")
  })

"""
if anchor not in text:
    raise RuntimeError('Standard PDF test insertion point was not found')
standard_test.write_text(text.replace(anchor, addition + anchor, 1))

print('Prepared PDF priority patch applied.')

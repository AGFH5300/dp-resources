from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'Missing expected {label} pattern')
    return text.replace(old, new, 1)

# Worker: extract page text and exact word geometry from one pdftotext bbox pass,
# upload compact private JSON beside the page images, and mark geometry ready.
worker_path = Path('scripts/pdf-preview-worker.mjs')
worker = worker_path.read_text()
worker = replace_once(
    worker,
    "  const textPath = join(workDir, 'search.txt');",
    "  const textPath = join(workDir, 'search.html');",
    'worker search path',
)

old_extract = '''async function extractPageText(sourcePath, outputPath, pageCount) {
  await execFile('pdftotext', ['-layout', '-enc', 'UTF-8', sourcePath, outputPath], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const raw = await readFile(outputPath, 'utf8');
  const split = raw.split('\\f');
  if (split.length > pageCount && !split[split.length - 1]?.trim()) split.pop();
  return Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: index + 1,
    text: normalizeSearchText(split[index] || ''),
  }));
}

async function storePageText(job, pages) {
  const { data, error } = await supabase.rpc('dp_store_pdf_preview_text', {
    p_document_id: job.id,
    p_pages: pages,
  });
  if (error) throw new Error(`Unable to save PDF search text: ${error.message}`);
  if (Number(data) !== pages.length) {
    throw new Error(`Saved search text for ${Number(data) || 0} of ${pages.length} PDF pages`);
  }
}
'''
new_extract = '''function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const rounded = (value) => Math.round(value * 1_000_000) / 1_000_000;

function parseBboxSearchIndex(output, pageCount) {
  const pages = [];
  const pagePattern = /<page\\s+width="([\\d.]+)"\\s+height="([\\d.]+)">([\\s\\S]*?)<\\/page>/g;
  for (const pageMatch of output.matchAll(pagePattern)) {
    const width = Number(pageMatch[1]);
    const height = Number(pageMatch[2]);
    if (!(width > 0) || !(height > 0)) throw new Error('pdftotext returned invalid page geometry');
    const words = [];
    const lines = [];
    let lineNumber = 0;
    const linePattern = /<line\\b[^>]*>([\\s\\S]*?)<\\/line>/g;
    for (const lineMatch of pageMatch[3].matchAll(linePattern)) {
      const lineWords = [];
      const wordPattern = /<word\\s+xMin="([\\d.]+)"\\s+yMin="([\\d.]+)"\\s+xMax="([\\d.]+)"\\s+yMax="([\\d.]+)">([\\s\\S]*?)<\\/word>/g;
      for (const wordMatch of lineMatch[1].matchAll(wordPattern)) {
        const text = decodeXml(wordMatch[5]).replace(/\\s+/g, ' ').trim();
        if (!text) continue;
        const xMin = Number(wordMatch[1]);
        const yMin = Number(wordMatch[2]);
        const xMax = Number(wordMatch[3]);
        const yMax = Number(wordMatch[4]);
        words.push([
          text.slice(0, 240),
          rounded(xMin / width),
          rounded(yMin / height),
          rounded((xMax - xMin) / width),
          rounded((yMax - yMin) / height),
          lineNumber,
        ]);
        lineWords.push(text);
      }
      if (lineWords.length) {
        lines.push(lineWords.join(' '));
        lineNumber += 1;
      }
    }
    pages.push({
      pageNumber: pages.length + 1,
      text: normalizeSearchText(lines.join(' ')),
      geometry: { v: 1, p: pages.length + 1, w: words },
    });
  }
  if (pages.length !== pageCount) throw new Error(`pdftotext returned geometry for ${pages.length} of ${pageCount} pages`);
  return pages;
}

async function extractPageSearchIndex(sourcePath, outputPath, pageCount) {
  await execFile('pdftotext', ['-bbox-layout', '-enc', 'UTF-8', sourcePath, outputPath], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseBboxSearchIndex(await readFile(outputPath, 'utf8'), pageCount);
}

async function storePageText(job, pages) {
  const payload = pages.map(({ pageNumber, text }) => ({ pageNumber, text }));
  const { data, error } = await supabase.rpc('dp_store_pdf_preview_text', {
    p_document_id: job.id,
    p_pages: payload,
  });
  if (error) throw new Error(`Unable to save PDF search text: ${error.message}`);
  if (Number(data) !== payload.length) {
    throw new Error(`Saved search text for ${Number(data) || 0} of ${payload.length} PDF pages`);
  }
}

async function uploadSearchGeometry(job, pages) {
  await mapConcurrent(pages, UPLOAD_CONCURRENCY, async ({ pageNumber, geometry }) => {
    const bytes = Buffer.from(JSON.stringify(geometry));
    const objectPath = `${job.storage_prefix}/search/page-${pageNumber}.json`;
    await withUploadRetry(pageNumber, () => supabase.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: 'application/json',
      cacheControl: '31536000',
      upsert: true,
    }));
  });
  const readyAt = new Date().toISOString();
  const { error } = await supabase.from('dp_pdf_preview_documents').update({
    search_geometry_ready_at: readyAt,
    updated_at: readyAt,
  }).eq('id', job.id);
  if (error) throw new Error(`Unable to mark PDF search geometry ready: ${error.message}`);
}
'''
worker = replace_once(worker, old_extract, new_extract, 'bbox extraction block')

worker = replace_once(
    worker,
    "console.log(JSON.stringify({ event: 'pdf_preview_resume_state', fileId: job.drive_file_id, pagesReady: readyPages.size, pageCount, searchReady: Boolean(job.text_ready_at) }));",
    "console.log(JSON.stringify({ event: 'pdf_preview_resume_state', fileId: job.drive_file_id, pagesReady: readyPages.size, pageCount, searchReady: Boolean(job.text_ready_at && job.search_geometry_ready_at) }));",
    'worker resume log',
)
worker = replace_once(
    worker,
    '''    if (!job.text_ready_at) {
      try {
        const pages = await extractPageText(sourcePath, textPath, pageCount);
        await storePageText(job, pages);
        job.text_ready_at = new Date().toISOString();
        console.log(JSON.stringify({ event: 'pdf_preview_text_ready', fileId: job.drive_file_id, pageCount }));
      } catch (textError) {
        console.warn(JSON.stringify({
          event: 'pdf_preview_text_failed',
          fileId: job.drive_file_id,
          message: textError instanceof Error ? textError.message : String(textError),
        }));
      }
    }
''',
    '''    if (!job.text_ready_at || !job.search_geometry_ready_at) {
      try {
        const pages = await extractPageSearchIndex(sourcePath, textPath, pageCount);
        await storePageText(job, pages);
        await uploadSearchGeometry(job, pages);
        const readyAt = new Date().toISOString();
        job.text_ready_at = readyAt;
        job.search_geometry_ready_at = readyAt;
        console.log(JSON.stringify({ event: 'pdf_preview_text_ready', fileId: job.drive_file_id, pageCount, exactHighlightsReady: true }));
      } catch (textError) {
        console.warn(JSON.stringify({
          event: 'pdf_preview_text_failed',
          fileId: job.drive_file_id,
          message: textError instanceof Error ? textError.message : String(textError),
        }));
      }
    }
''',
    'worker text indexing block',
)
worker = replace_once(
    worker,
    "console.log(JSON.stringify({ event: 'pdf_preview_ready', fileId: job.drive_file_id, pageCount, searchReady: Boolean(job.text_ready_at) }));",
    "console.log(JSON.stringify({ event: 'pdf_preview_ready', fileId: job.drive_file_id, pageCount, searchReady: Boolean(job.text_ready_at && job.search_geometry_ready_at) }));",
    'worker ready log',
)
worker_path.write_text(worker)

# Document type/readiness.
derivatives_path = Path('lib/pdf-preview-derivatives.ts')
derivatives = derivatives_path.read_text()
derivatives = replace_once(derivatives, "  text_ready_at: string | null;\n", "  text_ready_at: string | null;\n  search_geometry_ready_at: string | null;\n", 'document type geometry timestamp')
derivatives = replace_once(derivatives, "completed_at,text_ready_at,updated_at'", "completed_at,text_ready_at,search_geometry_ready_at,updated_at'", 'document columns geometry timestamp')
derivatives_path.write_text(derivatives)

# Manifest/status only advertise search once exact geometry is available.
for route_name in [
    'app/api/resource/[fileId]/pdf-preview/manifest/route.ts',
    'app/api/resource/[fileId]/pdf-preview/status/route.ts',
]:
    path = Path(route_name)
    text = path.read_text().replace(
        'Boolean(manifest.document.text_ready_at)',
        'Boolean(manifest.document.text_ready_at && manifest.document.search_geometry_ready_at)',
    ).replace(
        'Boolean(preview.text_ready_at)',
        'Boolean(preview.text_ready_at && preview.search_geometry_ready_at)',
    )
    path.write_text(text)

# Single and batch workflows must re-index previously text-only books once, without recreating images.
prepare_path = Path('scripts/prepare-pdf-preview.mjs')
prepare = prepare_path.read_text()
prepare = replace_once(prepare, "    && Boolean(document.text_ready_at)\n", "    && Boolean(document.text_ready_at)\n    && Boolean(document.search_geometry_ready_at)\n", 'single ready geometry condition')
prepare = replace_once(prepare, "      searchReady: true,\n", "      searchReady: true,\n      exactHighlightsReady: true,\n", 'single already-ready log')
prepare = replace_once(prepare, "    searchReady: Boolean(completed.text_ready_at),\n", "    searchReady: Boolean(completed.text_ready_at && completed.search_geometry_ready_at),\n    exactHighlightsReady: Boolean(completed.search_geometry_ready_at),\n", 'single completed log')
prepare_path.write_text(prepare)

batch_path = Path('scripts/prepare-pdf-previews-batch.mjs')
batch = batch_path.read_text()
batch = replace_once(batch, "      && Boolean(existing.text_ready_at)\n", "      && Boolean(existing.text_ready_at)\n      && Boolean(existing.search_geometry_ready_at)\n", 'batch ready geometry condition')
batch = replace_once(batch, "      searchReady: Boolean(document?.text_ready_at),\n", "      searchReady: Boolean(document?.text_ready_at && document?.search_geometry_ready_at),\n", 'batch result geometry readiness')
batch_path.write_text(batch)

# Search route: keep page search in Supabase, fetch only the requested page's private geometry,
# find every phrase occurrence, and return exact rectangles.
search_route = Path('app/api/resource/[fileId]/pdf-preview/search/route.ts')
search_route.write_text(r'''import { PDF_PREVIEW_BUCKET, getPdfPreviewDocumentByIdentity } from '@/lib/pdf-preview-derivatives';
import { pdfPreviewSessionFromRequest } from '@/lib/pdf-preview-session';
import { getPrivateR2Object } from '@/lib/r2-s3';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GeometryWord = [string, number, number, number, number, number];
type GeometryPayload = { v: number; p: number; w: GeometryWord[] };
type Segment = { start: number; end: number; word: GeometryWord };
type Rect = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const normalize = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function getSupabaseObject(bucket: string, objectPath: string, signal: AbortSignal) {
  const storageBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!storageBaseUrl || !serviceRoleKey) return null;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const storageUrl = `${storageBaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`;
  return fetch(storageUrl, {
    cache: 'no-store',
    signal,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  }).catch(() => null);
}

function validGeometry(value: unknown, pageNumber: number): GeometryPayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GeometryPayload>;
  if (candidate.v !== 1 || candidate.p !== pageNumber || !Array.isArray(candidate.w)) return null;
  const words = candidate.w.filter((word): word is GeometryWord => Array.isArray(word)
    && word.length === 6
    && typeof word[0] === 'string'
    && word.slice(1).every((part) => typeof part === 'number' && Number.isFinite(part)));
  return words.length === candidate.w.length ? { v: 1, p: pageNumber, w: words } : null;
}

function mergeWords(words: GeometryWord[]): Rect[] {
  const rects: Rect[] = [];
  for (const word of words) {
    const [, x, y, width, height, line] = word;
    const previous = rects[rects.length - 1] as (Rect & { line?: number }) | undefined;
    const right = x + width;
    if (previous && previous.line === line && x - (previous.x + previous.width) <= 0.018) {
      previous.width = clamp(Math.max(previous.x + previous.width, right) - previous.x, 0, 1 - previous.x);
      previous.y = Math.min(previous.y, y);
      previous.height = Math.max(previous.y + previous.height, y + height) - previous.y;
    } else {
      rects.push({
        x: clamp(x - 0.002),
        y: clamp(y - 0.0015),
        width: clamp(width + 0.004, 0.002, 1 - clamp(x - 0.002)),
        height: clamp(height + 0.003, 0.003, 1 - clamp(y - 0.0015)),
        line,
      } as Rect & { line: number });
    }
  }
  return rects.map(({ x, y, width, height }) => ({ x, y, width, height }));
}

function exactMatches(payload: GeometryPayload, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  let pageText = '';
  const segments: Segment[] = [];
  for (const word of payload.w) {
    const token = normalize(word[0]);
    if (!token) continue;
    if (pageText) pageText += ' ';
    const start = pageText.length;
    pageText += token;
    segments.push({ start, end: pageText.length, word });
  }
  const matches: { rects: Rect[] }[] = [];
  let from = 0;
  while (from <= pageText.length - normalizedQuery.length) {
    const index = pageText.indexOf(normalizedQuery, from);
    if (index < 0) break;
    const end = index + normalizedQuery.length;
    const words = segments.filter((segment) => segment.end > index && segment.start < end).map((segment) => segment.word);
    if (words.length) matches.push({ rects: mergeWords(words) });
    from = index + Math.max(1, normalizedQuery.length);
  }
  return matches;
}

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const session = pdfPreviewSessionFromRequest(req, fileId);
  if (!session) return new Response('Invalid or expired PDF preview session', { status: 401 });

  const url = new URL(req.url);
  const requestedVersion = url.searchParams.get('v');
  if (requestedVersion !== session.previewVersionKey) return new Response('PDF preview version changed', {
    status: 409,
    headers: { 'cache-control': 'private, no-store' },
  });

  const query = (url.searchParams.get('q') || '').trim();
  if (query.length < 2 || query.length > 100) {
    return Response.json({ ready: true, results: [], message: 'Enter between 2 and 100 characters.' }, {
      status: 400,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const document = await getPdfPreviewDocumentByIdentity(session.previewId, session.previewVersionKey).catch(() => null);
  if (!document?.text_ready_at || !document.search_geometry_ready_at) {
    return Response.json({ ready: false, results: [], exactHighlightsReady: false }, {
      status: 202,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const requestedPage = url.searchParams.get('page');
  if (requestedPage !== null) {
    const pageNumber = Number(requestedPage);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > Number(document.page_count || 0)) {
      return new Response('Invalid PDF search page', { status: 400 });
    }
    const storageProvider = session.previewStorageProvider || 'supabase';
    const storageBucket = session.previewStorageBucket || PDF_PREVIEW_BUCKET;
    const storagePrefix = session.previewStoragePrefix || `${session.fileId}/${session.previewVersionKey}`;
    const objectPath = `${storagePrefix}/search/page-${pageNumber}.json`;
    const upstream = storageProvider === 'r2'
      ? await getPrivateR2Object(storageBucket, objectPath, req.signal).catch(() => null)
      : await getSupabaseObject(storageBucket, objectPath, req.signal);
    if (upstream?.status === 404) return Response.json({ ready: false, pageNumber, matches: [] }, { status: 202 });
    if (!upstream?.ok) return new Response('Unable to retrieve PDF search geometry', { status: upstream ? 502 : 503 });
    const payload = validGeometry(await upstream.json().catch(() => null), pageNumber);
    if (!payload) return new Response('Invalid PDF search geometry', { status: 502 });
    const matches = exactMatches(payload, query);
    return Response.json({ ready: true, exactHighlightsReady: true, pageNumber, matches }, {
      headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
    });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc('dp_search_pdf_preview', {
    p_document_id: session.previewId,
    p_query: query,
    p_limit: 100,
  });
  if (error) return new Response('Unable to search PDF preview', { status: 502 });

  return Response.json({
    ready: true,
    exactHighlightsReady: true,
    results: (data || []).map((result: { page_number: number; snippet: string | null }) => ({
      pageNumber: Number(result.page_number),
      snippet: result.snippet || '',
    })),
  }, {
    headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
}
''')

# Viewer: remove page-level tint, lazily fetch exact rectangles for matching visible pages,
# and draw every matching word/phrase box inside the rotated page plane.
viewer_path = Path('app/resource/[fileId]/pdf-viewer.tsx')
viewer = viewer_path.read_text()
viewer = replace_once(
    viewer,
    "type Result={pageNumber:number;snippet:string};type SearchMarker={query:string;active:boolean;position:number;total:number};",
    "type Result={pageNumber:number;snippet:string};type SearchRect={x:number;y:number;width:number;height:number};type SearchMatch={rects:SearchRect[]};",
    'viewer search types',
)
viewer = replace_once(
    viewer,
    "const PdfPage=memo(function PdfPage({fileId,version,page,active,zoom,rotation,register,onFirst,tool,color,marks,onAdd,onErase,searchMarker}:{fileId:string;version:string;page:Page;active:boolean;zoom:number;rotation:Rotation;register:(n:number,node:HTMLElement|null)=>void;onFirst:()=>void;tool:Tool;color:string;marks:Stroke[];onAdd:(n:number,s:Stroke)=>void;onErase:(n:number,p:Point)=>void;searchMarker:SearchMarker|null})",
    "const PdfPage=memo(function PdfPage({fileId,version,page,active,zoom,rotation,register,onFirst,tool,color,marks,onAdd,onErase,searchMatches}:{fileId:string;version:string;page:Page;active:boolean;zoom:number;rotation:Rotation;register:(n:number,node:HTMLElement|null)=>void;onFirst:()=>void;tool:Tool;color:string;marks:Stroke[];onAdd:(n:number,s:Stroke)=>void;onErase:(n:number,p:Point)=>void;searchMatches:SearchMatch[]})",
    'viewer page signature',
)
viewer = replace_once(
    viewer,
    "className={`absolute inset-0 h-full w-full object-contain ${loaded?'opacity-100':'opacity-0'}`}/>:null}<svg",
    "className={`absolute inset-0 h-full w-full object-contain ${loaded?'opacity-100':'opacity-0'}`}/>:null}{searchMatches.length?<div className=\"pointer-events-none absolute inset-0 z-[1]\" aria-label={`${searchMatches.length} exact search match${searchMatches.length===1?'':'es'} on page ${page.pageNumber}`}>{searchMatches.flatMap((match,matchIndex)=>match.rects.map((rect,rectIndex)=><span key={`${matchIndex}-${rectIndex}`} className=\"absolute rounded-[2px] bg-yellow-300/70 ring-1 ring-amber-500/70\" style={{left:`${rect.x*100}%`,top:`${rect.y*100}%`,width:`${rect.width*100}%`,height:`${rect.height*100}%`,mixBlendMode:'multiply'}}/>))}</div>:null}<svg",
    'viewer exact highlight layer',
)
old_marker = "</svg></div>{searchMarker?<div className={`pointer-events-none absolute inset-0 z-10 border-4 ${searchMarker.active?'border-amber-400 bg-amber-300/10':'border-amber-300/60 bg-amber-200/5'}`} aria-label={`Search match on page ${page.pageNumber}`}><div className=\"absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-md border border-amber-300 bg-amber-50/95 px-2.5 py-1.5 text-xs font-semibold text-amber-950 shadow-md backdrop-blur-sm\">{searchMarker.active?`Search result ${searchMarker.position} of ${searchMarker.total}: “${searchMarker.query}”`:`Search match: “${searchMarker.query}”`}</div></div>:null}{(!active||!page.ready||!loaded)&&!failed?"
viewer = replace_once(viewer, old_marker, "</svg></div>{(!active||!page.ready||!loaded)&&!failed?", 'remove page-level marker')
viewer = replace_once(
    viewer,
    "const marksRef=useRef<Marks>({});const currentRef=useRef(1);",
    "const marksRef=useRef<Marks>({});const searchRequests=useRef(new Set<string>());const currentRef=useRef(1);",
    'viewer search request ref',
)
viewer = replace_once(
    viewer,
    "const[searchMessage,setSearchMessage]=useState('');const[annotationOpen",
    "const[searchMessage,setSearchMessage]=useState('');const[searchedQuery,setSearchedQuery]=useState('');const[searchMatches,setSearchMatches]=useState<Record<number,SearchMatch[]>>({});const[annotationOpen",
    'viewer search states',
)
old_search = "const runSearch=useCallback(async(e?:React.FormEvent)=>{e?.preventDefault();if(!manifest)return;const q=query.trim();if(q.length<2){setSearchMessage('Enter at least two characters.');return}if(!manifest.searchReady){setSearchMessage('Search is not indexed yet. Run the preparation workflow once more for this existing PDF.');return}setSearching(true);try{const r=await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-preview/search?q=${encodeURIComponent(q)}&v=${encodeURIComponent(manifest.versionKey)}`,{credentials:'same-origin',cache:'no-store'});const data=await r.json() as{ready?:boolean;results?:Result[];message?:string};if(!r.ok&&r.status!==202)throw new Error(data.message||`Search failed (${r.status})`);const found=Array.isArray(data.results)?data.results:[];setResults(found);setResultIndex(found.length?0:-1);setSearchMessage(data.ready===false?'Search is not indexed yet.':found.length?`${found.length} matching page${found.length===1?'':'s'}.`:'No matches found.');if(found[0])jump(found[0].pageNumber)}catch(err){setResults([]);setResultIndex(-1);setSearchMessage(err instanceof Error?err.message:'Search failed.')}finally{setSearching(false)}},[fileId,jump,manifest,query]);const moveResult=(direction:-1|1)=>{if(!results.length)return;const next=(resultIndex+direction+results.length)%results.length;setResultIndex(next);jump(results[next].pageNumber)};"
new_search = "const loadExactMatches=useCallback(async(pageNumber:number,q:string)=>{if(!manifest||!q)return;const key=`${manifest.versionKey}:${q}:${pageNumber}`;if(searchRequests.current.has(key))return;searchRequests.current.add(key);try{const r=await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-preview/search?q=${encodeURIComponent(q)}&v=${encodeURIComponent(manifest.versionKey)}&page=${pageNumber}`,{credentials:'same-origin',cache:'no-store'});const data=await r.json() as{ready?:boolean;matches?:SearchMatch[]};if(r.ok&&data.ready)setSearchMatches(previous=>({...previous,[pageNumber]:Array.isArray(data.matches)?data.matches:[]}));else searchRequests.current.delete(key)}catch{searchRequests.current.delete(key)}},[fileId,manifest]);const runSearch=useCallback(async(e?:React.FormEvent)=>{e?.preventDefault();if(!manifest)return;const q=query.trim();if(q.length<2){setSearchMessage('Enter at least two characters.');return}if(!manifest.searchReady){setSearchMessage('Exact search highlighting is not indexed yet. Run the preparation workflow once more for this PDF.');return}setSearching(true);try{const r=await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-preview/search?q=${encodeURIComponent(q)}&v=${encodeURIComponent(manifest.versionKey)}`,{credentials:'same-origin',cache:'no-store'});const data=await r.json() as{ready?:boolean;results?:Result[];message?:string};if(!r.ok&&r.status!==202)throw new Error(data.message||`Search failed (${r.status})`);const found=Array.isArray(data.results)?data.results:[];searchRequests.current.clear();setSearchMatches({});setSearchedQuery(q);setResults(found);setResultIndex(found.length?0:-1);setSearchMessage(data.ready===false?'Exact search highlighting is not indexed yet.':found.length?`${found.length} matching page${found.length===1?'':'s'}. Matching words are highlighted in yellow.`:'No matches found.');if(found[0]){void loadExactMatches(found[0].pageNumber,q);jump(found[0].pageNumber)}}catch(err){setResults([]);setResultIndex(-1);setSearchedQuery('');setSearchMatches({});setSearchMessage(err instanceof Error?err.message:'Search failed.')}finally{setSearching(false)}},[fileId,jump,loadExactMatches,manifest,query]);const moveResult=(direction:-1|1)=>{if(!results.length)return;const next=(resultIndex+direction+results.length)%results.length;setResultIndex(next);void loadExactMatches(results[next].pageNumber,searchedQuery);jump(results[next].pageNumber)};"
viewer = replace_once(viewer, old_search, new_search, 'viewer search behavior')
viewer = replace_once(
    viewer,
    "const pages=useMemo(()=>manifest?.pages||[],[manifest]);const activeResult=resultIndex>=0?results[resultIndex]:null;const resultPositions=useMemo(()=>{const positions=new Map<number,number>();results.forEach((result,index)=>{if(!positions.has(result.pageNumber))positions.set(result.pageNumber,index+1)});return positions},[results]);if(error)",
    "const pages=useMemo(()=>manifest?.pages||[],[manifest]);const activeResult=resultIndex>=0?results[resultIndex]:null;const resultPages=useMemo(()=>new Set(results.map(result=>result.pageNumber)),[results]);useEffect(()=>{if(!searchedQuery)return;for(const pageNumber of active)if(resultPages.has(pageNumber)&&searchMatches[pageNumber]===undefined)void loadExactMatches(pageNumber,searchedQuery)},[active,loadExactMatches,resultPages,searchMatches,searchedQuery]);if(error)",
    'viewer lazy exact highlighting',
)
viewer = replace_once(
    viewer,
    "onClick={()=>jump(activeResult.pageNumber)}",
    "onClick={()=>{void loadExactMatches(activeResult.pageNumber,searchedQuery);jump(activeResult.pageNumber)}}",
    'viewer snippet navigation',
)
viewer = replace_once(
    viewer,
    "onAdd={add} onErase={erase} searchMarker={resultPositions.has(page.pageNumber)&&query.trim()?{query:query.trim(),active:activeResult?.pageNumber===page.pageNumber,position:resultPositions.get(page.pageNumber)!,total:results.length}:null}/>",
    "onAdd={add} onErase={erase} searchMatches={searchMatches[page.pageNumber]||[]}/>",
    'viewer page exact matches prop',
)
viewer_path.write_text(viewer)

# Additive schema marker only; geometry bytes stay in private object storage.
migration_path = Path('supabase/migrations/20260714220000_pdf_preview_exact_search_geometry.sql')
migration_path.write_text('''-- Track exact word-coordinate search indexes stored privately beside preview page images.\n\nalter table public.dp_pdf_preview_documents\n  add column if not exists search_geometry_ready_at timestamptz;\n\ncomment on column public.dp_pdf_preview_documents.search_geometry_ready_at is\n  'Set after every page has a private pdftotext bbox geometry object for exact in-page search highlighting.';\n''')

# Regression assertions.
test_path = Path('tests/pdf-progressive-loader.test.ts')
test = test_path.read_text()
test = test.replace("    expect(viewer).toContain('Search result ${searchMarker.position} of ${searchMarker.total}');\n", "    expect(viewer).toContain('Matching words are highlighted in yellow.');\n    expect(viewer).toContain('searchMatches.flatMap');\n    expect(viewer).toContain('mixBlendMode:\'multiply\'');\n    expect(viewer).not.toContain('border-amber-400 bg-amber-300/10');\n")
test = test.replace("    expect(searchRoute).toContain('dp_search_pdf_preview');\n", "    expect(searchRoute).toContain('dp_search_pdf_preview');\n    expect(searchRoute).toContain('exactMatches');\n    expect(searchRoute).toContain('search/page-${pageNumber}.json');\n    expect(searchRoute).toContain('getPrivateR2Object');\n")
test = test.replace("    const searchMigration = read('supabase/migrations/20260714193000_pdf_preview_search_text.sql');\n", "    const searchMigration = read('supabase/migrations/20260714193000_pdf_preview_search_text.sql');\n    const exactSearchMigration = read('supabase/migrations/20260714220000_pdf_preview_exact_search_geometry.sql');\n")
test = test.replace("    expect(searchMigration).toContain('dp_search_pdf_preview');\n", "    expect(searchMigration).toContain('dp_search_pdf_preview');\n    expect(exactSearchMigration).toContain('search_geometry_ready_at');\n")
test = test.replace("    expect(worker).toContain(\"execFile('pdftotext'\");\n", "    expect(worker).toContain(\"execFile('pdftotext'\");\n    expect(worker).toContain(\"'-bbox-layout'\");\n    expect(worker).toContain('/search/page-${pageNumber}.json');\n    expect(worker).toContain('uploadSearchGeometry');\n")
test = test.replace("    expect(prepare).toContain('Boolean(document.text_ready_at)');\n", "    expect(prepare).toContain('Boolean(document.text_ready_at)');\n    expect(prepare).toContain('Boolean(document.search_geometry_ready_at)');\n")
test = test.replace("    expect(batch).toContain('Boolean(existing.text_ready_at)');\n", "    expect(batch).toContain('Boolean(existing.text_ready_at)');\n    expect(batch).toContain('Boolean(existing.search_geometry_ready_at)');\n")
test_path.write_text(test)

print('Applied exact word-coordinate PDF search highlighting changes.')

from pathlib import Path
import re

path = Path('app/resource/[fileId]/pdf-viewer.tsx')
text = path.read_text()

text = text.replace(
    "type State={status:Status;pageCount:number|null;pagesReady:number;manifestUrl:string|null;statusUrl?:string;searchReady?:boolean;message?:string};",
    "type State={mode?:'prepared'|'standard';status:Status|string;pageCount:number|null;pagesReady:number;manifestUrl:string|null;statusUrl?:string|null;standardUrl?:string;searchReady?:boolean;message?:string};",
    1,
)

fallback_marker = "function Fallback({fileId,message,onRetry}:{fileId:string;message:string;onRetry:()=>void}){return <section role=\"alert\" className=\"rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950\"><h2 className=\"text-base font-semibold\">PDF preview could not be displayed</h2><p className=\"mt-2\">{message}</p><div className=\"mt-4 flex gap-3\"><button type=\"button\" onClick={onRetry} className=\"inline-flex items-center gap-2 rounded-md bg-[color:var(--dp-navy)] px-3 py-2 text-white\"><RotateCcw className=\"size-4\"/>Retry preview</button><a href={`/api/files/${fileId}/download`} className=\"inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2\"><Download className=\"size-4\"/>Download PDF</a></div></section>}"
standard_component = """
function StandardPdfViewer({url,fileId,name}:{url:string;fileId:string;name:string}){const[attempt,setAttempt]=useState(0);const[blobUrl,setBlobUrl]=useState('');const[loading,setLoading]=useState(true);const[error,setError]=useState('');useEffect(()=>{const controller=new AbortController();let objectUrl='';setBlobUrl('');setLoading(true);setError('');void(async()=>{try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});const type=response.headers.get('content-type')||'';if(!response.ok||!type.toLowerCase().includes('pdf'))throw new Error(`PDF request failed (${response.status})`);const blob=await response.blob();if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setBlobUrl(objectUrl)}catch(reason){if(reason instanceof DOMException&&reason.name==='AbortError')return;setError('The standard PDF preview could not be loaded. You can retry or download the original file.')}finally{if(!controller.signal.aborted)setLoading(false)}})();return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[attempt,url]);if(error)return <Fallback fileId={fileId} message={error} onRetry={()=>setAttempt(value=>value+1)}/>;return <section className="relative h-[min(86dvh,calc(100dvh-6rem))] min-h-[560px] overflow-hidden border border-slate-300 bg-white" aria-label={`${name} standard PDF preview`}>{loading?<div className="absolute inset-0 z-10 grid place-items-center bg-slate-100"><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-[color:var(--dp-navy)] shadow"><span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-[color:var(--dp-blue)]"/>Loading PDF…</div></div>:null}{blobUrl?<iframe title={name} src={blobUrl} className="h-full w-full bg-white"/>:null}</section>}
""".strip()
if fallback_marker not in text:
    raise RuntimeError('Fallback component marker was not found')
text = text.replace(fallback_marker, fallback_marker + standard_component, 1)

old_signature = "export function PdfViewer({fileId,name}:{url:string;fileId:string;name:string})"
new_signature = "export function PdfViewer({url,fileId,name}:{url:string;fileId:string;name:string})"
if old_signature not in text:
    raise RuntimeError('PdfViewer signature was not found')
text = text.replace(old_signature, new_signature, 1)

old_state = "const[firstReady,setFirstReady]=useState(false);const[error,setError]=useState('');const[fullscreen,setFullscreen]=useState(false);"
new_state = "const[firstReady,setFirstReady]=useState(false);const[standardUrl,setStandardUrl]=useState('');const[error,setError]=useState('');const[fullscreen,setFullscreen]=useState(false);"
if old_state not in text:
    raise RuntimeError('PdfViewer state marker was not found')
text = text.replace(old_state, new_state, 1)

pattern = re.compile(r"useEffect\(\(\)=>\{const controller=new AbortController\(\);let timer:ReturnType<typeof setTimeout>\|null=null;let stopped=false;.*?\},\[attempt,fileId,loadManifest\]\);", re.S)
replacement = "useEffect(()=>{const controller=new AbortController();let stopped=false;setState(null);setManifest(null);setStandardUrl('');setFirstReady(false);setError('');setZoom(1);setRotation(0);currentRef.current=1;setCurrent(1);setActive(new Set([1]));void(async()=>{try{const response=await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-session`,{method:'POST',credentials:'same-origin',signal:controller.signal,cache:'no-store'});if(!response.ok){if(!stopped)setStandardUrl(url);return}const next=await response.json() as State;if(stopped)return;setState(next);if(next.mode==='standard'||!next.manifestUrl){setStandardUrl(next.standardUrl||url);return}await loadManifest(next.manifestUrl,controller.signal)}catch(reason){if(stopped||(reason instanceof DOMException&&reason.name==='AbortError'))return;setStandardUrl(url)}})();return()=>{stopped=true;controller.abort()}},[attempt,fileId,loadManifest,url]);"
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise RuntimeError(f'Expected to replace one PDF session effect, replaced {count}')

old_render = "if(error)return <Fallback fileId={fileId} message={error} onRetry={()=>setAttempt(v=>v+1)}/>;return <section"
new_render = "if(standardUrl)return <StandardPdfViewer url={standardUrl} fileId={fileId} name={name}/>;if(error)return <Fallback fileId={fileId} message={error} onRetry={()=>setAttempt(v=>v+1)}/>;return <section"
if old_render not in text:
    raise RuntimeError('PdfViewer render marker was not found')
text = text.replace(old_render, new_render, 1)

path.write_text(text)
print('Patched standard PDF fallback into pdf-viewer.tsx')

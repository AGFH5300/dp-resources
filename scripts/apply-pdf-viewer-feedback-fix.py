from pathlib import Path
import re

viewer_path = Path('app/resource/[fileId]/pdf-viewer.tsx')
test_path = Path('tests/pdf-progressive-loader.test.ts')
viewer = viewer_path.read_text()
test = test_path.read_text()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'Missing expected {label} pattern')
    return text.replace(old, new, 1)


viewer = replace_once(
    viewer,
    "type Result={pageNumber:number;snippet:string};",
    "type Result={pageNumber:number;snippet:string};type SearchMarker={query:string;active:boolean;position:number;total:number};",
    'search marker type',
)

old_signature = "const PdfPage=memo(function PdfPage({fileId,version,page,active,zoom,rotation,register,onFirst,tool,color,marks,onAdd,onErase}:{fileId:string;version:string;page:Page;active:boolean;zoom:number;rotation:Rotation;register:(n:number,node:HTMLElement|null)=>void;onFirst:()=>void;tool:Tool;color:string;marks:Stroke[];onAdd:(n:number,s:Stroke)=>void;onErase:(n:number,p:Point)=>void})"
new_signature = "const PdfPage=memo(function PdfPage({fileId,version,page,active,zoom,rotation,register,onFirst,tool,color,marks,onAdd,onErase,searchMarker}:{fileId:string;version:string;page:Page;active:boolean;zoom:number;rotation:Rotation;register:(n:number,node:HTMLElement|null)=>void;onFirst:()=>void;tool:Tool;color:string;marks:Stroke[];onAdd:(n:number,s:Stroke)=>void;onErase:(n:number,p:Point)=>void;searchMarker:SearchMarker|null})"
viewer = replace_once(viewer, old_signature, new_signature, 'PdfPage signature')

viewer = replace_once(
    viewer,
    "</svg></div>{(!active||!page.ready||!loaded)&&!failed?",
    "</svg></div>{searchMarker?<div className={`pointer-events-none absolute inset-0 z-10 border-4 ${searchMarker.active?'border-amber-400 bg-amber-300/10':'border-amber-300/60 bg-amber-200/5'}`} aria-label={`Search match on page ${page.pageNumber}`}><div className=\"absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-md border border-amber-300 bg-amber-50/95 px-2.5 py-1.5 text-xs font-semibold text-amber-950 shadow-md backdrop-blur-sm\">{searchMarker.active?`Search result ${searchMarker.position} of ${searchMarker.total}: “${searchMarker.query}”`:`Search match: “${searchMarker.query}”`}</div></div>:null}{(!active||!page.ready||!loaded)&&!failed?",
    'search marker overlay',
)

viewer = replace_once(
    viewer,
    "const marksRef=useRef<Marks>({});const[attempt",
    "const marksRef=useRef<Marks>({});const currentRef=useRef(1);const suppressCurrentUntil=useRef(0);const[attempt",
    'viewer stability refs',
)

viewer = replace_once(
    viewer,
    "setZoom(1);setRotation(0);setCurrent(1);setActive(new Set([1]));",
    "setZoom(1);setRotation(0);currentRef.current=1;setCurrent(1);setActive(new Set([1]));",
    'viewer reset current ref',
)

viewer = replace_once(
    viewer,
    "if(best)setCurrent(best)",
    "if(best&&Date.now()>=suppressCurrentUntil.current){currentRef.current=best;setCurrent(best)}",
    'observer current-page guard',
)

layout_pattern = re.compile(
    r"const jump=useCallback\(.*?const toggleFullscreen=async\(\)=>document\.fullscreenElement\?document\.exitFullscreen\(\):wrap\.current\?\.requestFullscreen\?\.\(\);",
    re.S,
)
layout_replacement = """const pageTop=useCallback((n:number)=>{const root=scroller.current,node=nodes.current.get(n);if(!root||!node)return null;return node.getBoundingClientRect().top-root.getBoundingClientRect().top+root.scrollTop},[]);const jump=useCallback((requested:number,behavior:ScrollBehavior='smooth')=>{if(!manifest)return;const n=clamp(Math.round(requested),1,manifest.pageCount);setActive(s=>new Set(s).add(n));currentRef.current=n;setCurrent(n);setPageInput(String(n));suppressCurrentUntil.current=Date.now()+(behavior==='smooth'?900:250);requestAnimationFrame(()=>{const root=scroller.current,top=pageTop(n);if(root&&top!==null)root.scrollTo({top:Math.max(0,top-8),behavior})})},[manifest,pageTop]);const preserveCurrentPage=useCallback((mutate:()=>void)=>{const root=scroller.current,n=currentRef.current,node=nodes.current.get(n);const before=root&&node?node.getBoundingClientRect().top-root.getBoundingClientRect().top:null;suppressCurrentUntil.current=Date.now()+900;mutate();requestAnimationFrame(()=>requestAnimationFrame(()=>{const nextRoot=scroller.current,nextNode=nodes.current.get(n);if(nextRoot&&nextNode&&before!==null){const after=nextNode.getBoundingClientRect().top-nextRoot.getBoundingClientRect().top;nextRoot.scrollTop+=after-before}currentRef.current=n;setCurrent(n);setPageInput(String(n));suppressCurrentUntil.current=Date.now()+250}))},[]);const submitPage=(e:React.FormEvent)=>{e.preventDefault();const n=Number(pageInput);if(Number.isFinite(n))jump(n);else setPageInput(String(currentRef.current));pageRef.current?.blur()};const setZoomStable=useCallback((next:number)=>preserveCurrentPage(()=>setZoom(clamp(+next.toFixed(2),.5,2.5))),[preserveCurrentPage]);const fit=()=>{const root=scroller.current,p=manifest?.pages[currentRef.current-1];if(!root||!p)return;const rotated=rotation===90||rotation===270;setZoomStable((root.clientWidth-48)/Math.min(1100,Math.max(280,rotated?p.height:p.width)))};const rotate=()=>preserveCurrentPage(()=>setRotation(v=>((v+90)%360) as Rotation));const openOriginal=useCallback((purpose:'reader'|'print')=>{window.open(`/api/resource/${encodeURIComponent(fileId)}/content#page=${currentRef.current}`,'_blank','noopener,noreferrer');setMessage(purpose==='print'?'The original PDF opened in a new tab. Use its print control.':'The original PDF opened in a new tab.');setTimeout(()=>setMessage(''),5000)},[fileId]);const toggleFullscreen=async()=>document.fullscreenElement?document.exitFullscreen():wrap.current?.requestFullscreen?.();"""
viewer, count = layout_pattern.subn(layout_replacement, viewer, count=1)
if count != 1:
    raise RuntimeError('Unable to replace page jump and layout controls')

viewer = replace_once(
    viewer,
    "onBlur={()=>setPageInput(String(current))} className=\"h-8 w-14 rounded-sm border border-white/15 bg-[#1f2022] px-2 text-center text-sm text-white outline-none\"/>",
    "onBlur={()=>setPageInput(String(currentRef.current))} className=\"h-8 w-14 rounded-sm border border-white/25 bg-[#1f2022] px-2 text-center text-sm font-medium text-white placeholder:text-white/50 outline-none focus:border-white/60\" style={{color:'#fff',WebkitTextFillColor:'#fff',caretColor:'#fff',colorScheme:'dark'}}/>",
    'page input contrast',
)

viewer = replace_once(
    viewer,
    "onClick={()=>setZoom(v=>Math.max(.5,+(v-.15).toFixed(2)))}",
    "onClick={()=>setZoomStable(zoom-.15)}",
    'zoom out stability',
)
viewer = replace_once(
    viewer,
    "onClick={()=>setZoom(1)}",
    "onClick={()=>setZoomStable(1)}",
    'reset zoom stability',
)
viewer = replace_once(
    viewer,
    "onClick={()=>setZoom(v=>Math.min(2.5,+(v+.15).toFixed(2)))}",
    "onClick={()=>setZoomStable(zoom+.15)}",
    'zoom in stability',
)
viewer = replace_once(
    viewer,
    "onClick={()=>setRotation(v=>((v+90)%360) as Rotation)}",
    "onClick={rotate}",
    'rotation stability',
)

viewer = replace_once(
    viewer,
    "placeholder=\"Search in document\" className=\"h-8 min-w-48 flex-1 rounded border border-white/20 bg-[#202124] px-2 text-sm outline-none\"/>",
    "placeholder=\"Search in document\" className=\"h-8 min-w-48 flex-1 rounded border border-white/25 bg-[#202124] px-2 text-sm font-medium text-white placeholder:text-white/45 outline-none focus:border-white/60\" style={{color:'#fff',WebkitTextFillColor:'#fff',caretColor:'#fff',colorScheme:'dark'}}/>",
    'search input contrast',
)

viewer = replace_once(
    viewer,
    "const pages=useMemo(()=>manifest?.pages||[],[manifest]);const activeResult=resultIndex>=0?results[resultIndex]:null;if(error)",
    "const pages=useMemo(()=>manifest?.pages||[],[manifest]);const activeResult=resultIndex>=0?results[resultIndex]:null;const resultPositions=useMemo(()=>{const positions=new Map<number,number>();results.forEach((result,index)=>{if(!positions.has(result.pageNumber))positions.set(result.pageNumber,index+1)});return positions},[results]);if(error)",
    'search result page map',
)

viewer = replace_once(
    viewer,
    "onAdd={add} onErase={erase}/>)}</div></section>",
    "onAdd={add} onErase={erase} searchMarker={resultPositions.has(page.pageNumber)&&query.trim()?{query:query.trim(),active:activeResult?.pageNumber===page.pageNumber,position:resultPositions.get(page.pageNumber)!,total:results.length}:null}/>)}</div></section>",
    'search marker prop',
)

# Keep the regression suite focused on the corrected behaviour.
test = test.replace(
    "expect(viewer).toContain(\"scrollIntoView({behavior,block:'start'})\");",
    "expect(viewer).toContain(\"root.scrollTo({top:Math.max(0,top-8),behavior})\");\n    expect(viewer).toContain('preserveCurrentPage');\n    expect(viewer).toContain('suppressCurrentUntil');\n    expect(viewer).toContain('WebkitTextFillColor');\n    expect(viewer).toContain('Search result ${searchMarker.position} of ${searchMarker.total}');",
)

viewer_path.write_text(viewer)
test_path.write_text(test)
print('Applied PDF viewer scroll, layout, contrast and search-marker fixes.')

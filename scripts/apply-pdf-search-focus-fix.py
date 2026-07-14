from pathlib import Path
import re

viewer_path = Path("app/resource/[fileId]/pdf-viewer.tsx")
test_path = Path("tests/pdf-search-focus-match.test.ts")
text = viewer_path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise RuntimeError(f"Missing expected {label} pattern")
    text = text.replace(old, new, 1)


replace_once(
    "const marksRef=useRef<Marks>({});const searchRequests=useRef(new Set<string>());",
    "const marksRef=useRef<Marks>({});const searchMatchesRef=useRef<Record<number,SearchMatch[]>>({});const searchRequests=useRef(new Map<string,Promise<SearchMatch[]>>());",
    "search request refs",
)

replace_once(
    "const[searchMatches,setSearchMatches]=useState<Record<number,SearchMatch[]>>({});const[annotationOpen",
    "const[searchMatches,setSearchMatches]=useState<Record<number,SearchMatch[]>>({});const[activeSearchMatch,setActiveSearchMatch]=useState<{pageNumber:number;matchIndex:number}|null>(null);const[annotationOpen",
    "active search match state",
)

replace_once(
    "onAdd,onErase,searchMatches}:{fileId:string;version:string;page:Page;active:boolean;zoom:number;rotation:Rotation;register:(n:number,node:HTMLElement|null)=>void;onFirst:()=>void;tool:Tool;color:string;marks:Stroke[];onAdd:(n:number,s:Stroke)=>void;onErase:(n:number,p:Point)=>void;searchMatches:SearchMatch[]})",
    "onAdd,onErase,searchMatches,activeSearchMatchIndex}:{fileId:string;version:string;page:Page;active:boolean;zoom:number;rotation:Rotation;register:(n:number,node:HTMLElement|null)=>void;onFirst:()=>void;tool:Tool;color:string;marks:Stroke[];onAdd:(n:number,s:Stroke)=>void;onErase:(n:number,p:Point)=>void;searchMatches:SearchMatch[];activeSearchMatchIndex:number|null})",
    "PDF page search props",
)

old_highlight = "<span key={`${matchIndex}-${rectIndex}`} className=\"absolute rounded-[2px] bg-yellow-300/70 ring-1 ring-amber-500/70\" style={{left:`${rect.x*100}%`,top:`${rect.y*100}%`,width:`${rect.width*100}%`,height:`${rect.height*100}%`,mixBlendMode:'multiply'}}/>"
new_highlight = "<span key={`${matchIndex}-${rectIndex}`} data-pdf-search-match={matchIndex} className={`absolute rounded-[2px] ${activeSearchMatchIndex===matchIndex?'bg-orange-300/85 ring-2 ring-orange-600/90':'bg-yellow-300/70 ring-1 ring-amber-500/70'}`} style={{left:`${rect.x*100}%`,top:`${rect.y*100}%`,width:`${rect.width*100}%`,height:`${rect.height*100}%`,mixBlendMode:'multiply'}}/>"
replace_once(old_highlight, new_highlight, "search highlight span")

jump_marker = "const preserveCurrentPage=useCallback"
scroll_helper = "const scrollToSearchMatch=useCallback((pageNumber:number,matchIndex:number,behavior:ScrollBehavior='smooth')=>{suppressCurrentUntil.current=Date.now()+(behavior==='smooth'?1100:350);requestAnimationFrame(()=>requestAnimationFrame(()=>{const root=scroller.current,pageNode=nodes.current.get(pageNumber),hit=pageNode?.querySelector<HTMLElement>(`[data-pdf-search-match=\"${matchIndex}\"]`);if(!root||!hit)return;const rootRect=root.getBoundingClientRect(),hitRect=hit.getBoundingClientRect();const target=root.scrollTop+(hitRect.top-rootRect.top)-Math.max(32,root.clientHeight*.32);root.scrollTo({top:Math.max(0,target),behavior});currentRef.current=pageNumber;setCurrent(pageNumber);setPageInput(String(pageNumber))}))},[]);"
if jump_marker not in text:
    raise RuntimeError("Missing preserveCurrentPage marker")
text = text.replace(jump_marker, scroll_helper + jump_marker, 1)

search_pattern = re.compile(
    r"const loadExactMatches=useCallback\(.*?const moveResult=\(direction:-1\|1\)=>\{.*?\};\nuseEffect\(\(\)=>\{const fn=\(e:KeyboardEvent\)=>",
    re.S,
)
search_replacement = """const loadExactMatches=useCallback(async(pageNumber:number,q:string):Promise<SearchMatch[]>=>{if(!manifest||!q)return[];const cached=searchMatchesRef.current[pageNumber];if(cached)return cached;const key=`${manifest.versionKey}:${q}:${pageNumber}`;const existing=searchRequests.current.get(key);if(existing)return existing;const request=(async()=>{try{const r=await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-preview/search?q=${encodeURIComponent(q)}&v=${encodeURIComponent(manifest.versionKey)}&page=${pageNumber}`,{credentials:'same-origin',cache:'no-store'});const data=await r.json() as{ready?:boolean;matches?:SearchMatch[]};if(!r.ok||!data.ready)return[];const matches=Array.isArray(data.matches)?data.matches:[];searchMatchesRef.current={...searchMatchesRef.current,[pageNumber]:matches};setSearchMatches(searchMatchesRef.current);return matches}catch{return[]}finally{searchRequests.current.delete(key)}})();searchRequests.current.set(key,request);return request},[fileId,manifest]);const focusSearchResult=useCallback(async(pageNumber:number,q:string,edge:'first'|'last'='first')=>{jump(pageNumber,'auto');const matches=await loadExactMatches(pageNumber,q);if(!matches.length){setActiveSearchMatch(null);return}const matchIndex=edge==='last'?matches.length-1:0;setActiveSearchMatch({pageNumber,matchIndex});scrollToSearchMatch(pageNumber,matchIndex)},[jump,loadExactMatches,scrollToSearchMatch]);const runSearch=useCallback(async(e?:React.FormEvent)=>{e?.preventDefault();if(!manifest)return;const q=query.trim();if(q.length<2){setSearchMessage('Enter at least two characters.');return}setSearching(true);try{const r=await fetch(`/api/resource/${encodeURIComponent(fileId)}/pdf-preview/search?q=${encodeURIComponent(q)}&v=${encodeURIComponent(manifest.versionKey)}`,{credentials:'same-origin',cache:'no-store'});const data=await r.json() as{ready?:boolean;results?:Result[];message?:string};if(!r.ok&&r.status!==202)throw new Error(data.message||`Search failed (${r.status})`);if(data.ready===false){setResults([]);setResultIndex(-1);setSearchedQuery('');searchMatchesRef.current={};setSearchMatches({});setActiveSearchMatch(null);setSearchMessage('Exact search highlighting is not indexed yet. Run the preparation workflow once more for this PDF.');return}const found=Array.isArray(data.results)?data.results:[];setManifest(previous=>previous?{...previous,searchReady:true}:previous);setState(previous=>previous?{...previous,searchReady:true}:previous);searchRequests.current.clear();searchMatchesRef.current={};setSearchMatches({});setActiveSearchMatch(null);setSearchedQuery(q);setResults(found);setResultIndex(found.length?0:-1);setSearchMessage(found.length?`${found.length} matching page${found.length===1?'':'s'}. Matching words are highlighted in yellow.`:'No matches found.');if(found[0])void focusSearchResult(found[0].pageNumber,q)}catch(err){setResults([]);setResultIndex(-1);setSearchedQuery('');searchMatchesRef.current={};setSearchMatches({});setActiveSearchMatch(null);setSearchMessage(err instanceof Error?err.message:'Search failed.')}finally{setSearching(false)}},[fileId,focusSearchResult,manifest,query]);const moveResult=async(direction:-1|1)=>{if(!results.length)return;const currentResult=results[resultIndex];if(currentResult){const matches=await loadExactMatches(currentResult.pageNumber,searchedQuery);const currentMatchIndex=activeSearchMatch?.pageNumber===currentResult.pageNumber?activeSearchMatch.matchIndex:(direction>0?-1:matches.length);const candidate=currentMatchIndex+direction;if(candidate>=0&&candidate<matches.length){setActiveSearchMatch({pageNumber:currentResult.pageNumber,matchIndex:candidate});scrollToSearchMatch(currentResult.pageNumber,candidate);return}}const next=(resultIndex+direction+results.length)%results.length;setResultIndex(next);await focusSearchResult(results[next].pageNumber,searchedQuery,direction<0?'last':'first')};
useEffect(()=>{const fn=(e:KeyboardEvent)=>"""
text, count = search_pattern.subn(search_replacement, text, count=1)
if count != 1:
    raise RuntimeError("Unable to replace PDF search navigation block")

replace_once(
    "onClick={()=>moveResult(-1)}",
    "onClick={()=>void moveResult(-1)}",
    "previous search result handler",
)
replace_once(
    "onClick={()=>moveResult(1)}",
    "onClick={()=>void moveResult(1)}",
    "next search result handler",
)
replace_once(
    "onClick={()=>{void loadExactMatches(activeResult.pageNumber,searchedQuery);jump(activeResult.pageNumber)}}",
    "onClick={()=>void focusSearchResult(activeResult.pageNumber,searchedQuery)}",
    "active result snippet handler",
)
replace_once(
    "onErase={erase} searchMatches={searchMatches[page.pageNumber]||[]}/>",
    "onErase={erase} searchMatches={searchMatches[page.pageNumber]||[]} activeSearchMatchIndex={activeSearchMatch?.pageNumber===page.pageNumber?activeSearchMatch.matchIndex:null}/>",
    "page active match prop",
)

viewer_path.write_text(text)

test_path.write_text("""import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const viewer = readFileSync('app/resource/[fileId]/pdf-viewer.tsx', 'utf8');

describe('PDF exact-search match focus', () => {
  it('scrolls the internal PDF viewport to the highlighted occurrence', () => {
    expect(viewer).toContain('scrollToSearchMatch');
    expect(viewer).toContain('data-pdf-search-match={matchIndex}');
    expect(viewer).toContain('hitRect.top-rootRect.top');
    expect(viewer).toContain("root.scrollTo({top:Math.max(0,target),behavior})");
    expect(viewer).not.toContain('scrollIntoView');
  });

  it('makes the active match stronger and cycles matches within a page', () => {
    expect(viewer).toContain("activeSearchMatchIndex===matchIndex?'bg-orange-300/85");
    expect(viewer).toContain('candidate>=0&&candidate<matches.length');
    expect(viewer).toContain("direction<0?'last':'first'");
  });

  it('focuses the first actual match after a search result page loads', () => {
    expect(viewer).toContain('void focusSearchResult(found[0].pageNumber,q)');
    expect(viewer).toContain('await loadExactMatches(pageNumber,q)');
    expect(viewer).toContain('scrollToSearchMatch(pageNumber,matchIndex)');
  });
});
""")

print('Applied exact PDF search match focus fix.')

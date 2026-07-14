from pathlib import Path

viewer_path = Path('app/resource/[fileId]/pdf-viewer.tsx')
viewer = viewer_path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global viewer
    if old not in viewer:
        raise RuntimeError(f'Missing expected {label} pattern')
    viewer = viewer.replace(old, new, 1)


replace_once(
    "if(!manifest.searchReady){setSearchMessage('Exact search highlighting is not indexed yet. Run the preparation workflow once more for this PDF.');return}setSearching(true);",
    "setSearching(true);",
    'stale manifest search gate',
)

replace_once(
    "const found=Array.isArray(data.results)?data.results:[];searchRequests.current.clear();",
    "if(data.ready===false){setResults([]);setResultIndex(-1);setSearchedQuery('');setSearchMatches({});setSearchMessage('Exact search highlighting is not indexed yet. Run the preparation workflow once more for this PDF.');return}const found=Array.isArray(data.results)?data.results:[];setManifest(previous=>previous?{...previous,searchReady:true}:previous);setState(previous=>previous?{...previous,searchReady:true}:previous);searchRequests.current.clear();",
    'live search readiness refresh',
)

replace_once(
    "style={{color:'#fff',WebkitTextFillColor:'#fff',caretColor:'#fff',colorScheme:'dark'}}/>",
    "style={{backgroundColor:'#1f2022',color:'#fff',WebkitTextFillColor:'#fff',caretColor:'#fff',colorScheme:'dark'}}/>",
    'page input background',
)

replace_once(
    "style={{color:'#fff',WebkitTextFillColor:'#fff',caretColor:'#fff',colorScheme:'dark'}}/><button type=\"submit\"",
    "style={{backgroundColor:'#202124',color:'#fff',WebkitTextFillColor:'#fff',caretColor:'#fff',colorScheme:'dark'}}/><button type=\"submit\"",
    'search input background',
)

replace_once(
    '<input ref={pageRef} aria-label="Page number" inputMode="numeric"',
    '<input ref={pageRef} aria-label="Page number" type="text" autoComplete="off" spellCheck={false} inputMode="numeric"',
    'page input attributes',
)

replace_once(
    '<input ref={searchRef} aria-label="Search PDF text" value={query}',
    '<input ref={searchRef} aria-label="Search PDF text" type="text" autoComplete="off" spellCheck={false} value={query}',
    'search input attributes',
)

viewer_path.write_text(viewer)
print('Applied PDF search readiness and toolbar input fixes.')

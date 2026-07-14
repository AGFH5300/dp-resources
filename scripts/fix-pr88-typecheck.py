from pathlib import Path

path = Path('app/resource/[fileId]/pdf-viewer.tsx')
text = path.read_text()
old = "setSearchMessage(data.ready===false?'Exact search highlighting is not indexed yet.':found.length?`${found.length} matching page${found.length===1?'':'s'}. Matching words are highlighted in yellow.`:'No matches found.');"
new = "setSearchMessage(found.length?`${found.length} matching page${found.length===1?'':'s'}. Matching words are highlighted in yellow.`:'No matches found.');"
if old not in text:
    raise RuntimeError('Expected redundant readiness message was not found')
path.write_text(text.replace(old, new, 1))
print('Removed unreachable PDF search readiness comparison.')

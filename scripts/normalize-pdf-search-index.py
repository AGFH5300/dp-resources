from pathlib import Path

worker_path = Path('scripts/pdf-preview-worker.mjs')
worker = worker_path.read_text()
old = '''function normalizeSearchText(value) {
  return value
    .replace(/\\u0000/g, '')
    .replace(/[\\t ]+\\n/g, '\\n')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim()
    .slice(0, 200000);
}
'''
new = '''function normalizeSearchText(value) {
  return value
    .replace(/\\u0000/g, '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\\p{L}\\p{N}]+/gu, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 200000);
}
'''
if old not in worker:
    raise RuntimeError('Missing PDF search text normalizer')
worker = worker.replace(old, new, 1)
old_word = 'const wordPattern = /<word\\s+xMin="([\\d.]+)"\\s+yMin="([\\d.]+)"\\s+xMax="([\\d.]+)"\\s+yMax="([\\d.]+)">([\\s\\S]*?)<\\/word>/g;'
new_word = 'const wordPattern = /<word\\s+xMin="(-?[\\d.]+)"\\s+yMin="(-?[\\d.]+)"\\s+xMax="(-?[\\d.]+)"\\s+yMax="(-?[\\d.]+)">([\\s\\S]*?)<\\/word>/g;'
if old_word not in worker:
    raise RuntimeError('Missing PDF bbox word pattern')
worker = worker.replace(old_word, new_word, 1)
worker_path.write_text(worker)

path = Path('tests/pdf-progressive-loader.test.ts')
test = path.read_text()
anchor = "    expect(worker).toContain(\"'-bbox-layout'\");\n"
addition = anchor + "    expect(worker).toContain(\".normalize('NFKC')\");\n    expect(worker).toContain('(-?[\\\\d.]+)');\n"
if anchor not in test:
    raise RuntimeError('Missing bbox regression assertion anchor')
test = test.replace(anchor, addition, 1)
path.write_text(test)
print('Normalized searchable page text and accepted negative PDF word coordinates.')

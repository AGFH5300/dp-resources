from pathlib import Path

path = Path('tests/pdf-progressive-loader.test.ts')
text = path.read_text()
old_quote = "    expect(viewer).toContain('mixBlendMode:'multiply'');"
new_quote = '    expect(viewer).toContain("mixBlendMode:\'multiply\'");'
if old_quote not in text:
    raise RuntimeError('Missing malformed mixBlendMode assertion')
text = text.replace(old_quote, new_quote, 1)
old_matcher = "    expect(searchRoute).toContain('exactMatches');"
new_matcher = "    expect(searchRoute).toContain('findPdfSearchMatches');"
if old_matcher not in text:
    raise RuntimeError('Missing old embedded matcher assertion')
text = text.replace(old_matcher, new_matcher, 1)
path.write_text(text)

Path('exact-pdf-search-typecheck.txt').unlink(missing_ok=True)
print('Finalized exact PDF search regression assertions and removed diagnostics.')

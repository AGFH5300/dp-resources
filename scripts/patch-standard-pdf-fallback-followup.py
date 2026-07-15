from pathlib import Path

viewer_path = Path('app/resource/[fileId]/pdf-viewer.tsx')
viewer = viewer_path.read_text()
old = "const type=response.headers.get('content-type')||'';if(!response.ok||!type.toLowerCase().includes('pdf'))throw new Error(`PDF request failed (${response.status})`);const blob=await response.blob();"
new = "if(!response.ok)throw new Error(`PDF request failed (${response.status})`);const sourceBlob=await response.blob();if(!sourceBlob.size)throw new Error('PDF response was empty');const blob=sourceBlob.type.toLowerCase().includes('pdf')?sourceBlob:new Blob([sourceBlob],{type:'application/pdf'});"
if old not in viewer:
    raise RuntimeError('Standard PDF MIME check marker was not found')
viewer_path.write_text(viewer.replace(old, new, 1))

test_path = Path('tests/pdf-progressive-loader.test.ts')
test = test_path.read_text()
replacements = {
    "expect(viewer).not.toContain('<iframe');": "expect(viewer).toContain('function StandardPdfViewer');\n    expect(viewer).toContain('<iframe');",
    "expect(sessionRoute).toContain('ensurePdfPreviewDocument');": "expect(sessionRoute).toContain('getPdfPreviewDocument');\n    expect(sessionRoute).not.toContain('ensurePdfPreviewDocument');",
    "expect(sessionRoute).not.toContain('getIndexedResourceShell');": "expect(sessionRoute).toContain('getIndexedResourceShell');",
}
for old_value, new_value in replacements.items():
    if old_value not in test:
        raise RuntimeError(f'Test marker was not found: {old_value}')
    test = test.replace(old_value, new_value, 1)

test_path.write_text(test)
print('Patched standard PDF fallback compatibility and regression expectations.')

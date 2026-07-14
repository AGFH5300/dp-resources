from pathlib import Path

worker_path = Path('scripts/pdf-preview-worker.mjs')
test_path = Path('tests/pdf-preview-render-free.test.ts')
worker = worker_path.read_text()
test = test_path.read_text()

old = "  const pattern = /^Page\\s+(\\d+)\\s+size:\\s+([\\d.]+) x ([\\d.]+) pts$/gm;"
new = "  const pattern = /^Page\\s+(\\d+)\\s+size:\\s+([\\d.]+)\\s+x\\s+([\\d.]+)\\s+pts(?:\\s+\\([^\\r\\n]*\\))?\\s*$/gm;"
if old not in worker:
    raise RuntimeError('Expected pdfinfo page-size parser was not found')
worker = worker.replace(old, new, 1)

anchor = "    expect(worker).toContain('dp_store_pdf_preview_text');\n"
addition = "    expect(worker).toContain('pts(?:\\\\s+\\\\([^\\\\r\\\\n]*\\\\))?\\\\s*$');\n"
if addition not in test:
    if anchor not in test:
        raise RuntimeError('Expected worker regression-test anchor was not found')
    test = test.replace(anchor, anchor + addition, 1)

worker_path.write_text(worker)
test_path.write_text(test)
print('Applied optional pdfinfo paper-size label support.')

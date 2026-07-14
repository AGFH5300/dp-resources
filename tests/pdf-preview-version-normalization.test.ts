import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const source = readFileSync('lib/pdf-preview-derivatives.ts', 'utf8');

function versionKey(modifiedTime: string) {
  return createHash('sha256')
    .update(`1I6IrD9hMk3P2nVUCertioitIwn_C8ApS\n${modifiedTime}\n65463051`)
    .digest('hex');
}

describe('PDF preview version normalization', () => {
  it('canonicalizes equivalent UTC timestamps to the format used by queued previews', () => {
    const canonical = new Date('2026-06-29T11:01:32.545Z').toISOString().replace(/Z$/, '+00:00');
    expect(canonical).toBe('2026-06-29T11:01:32.545+00:00');
    expect(versionKey(canonical)).toBe('0e54091cfd9b9534045289bb17c8e9d12aeedfc3a2756538f028bb98a71e7ba3');
  });

  it('reuses an already prepared source before creating a new version row', () => {
    expect(source).toContain("toISOString().replace(/Z$/, '+00:00')");
    expect(source).toContain('findReusablePdfPreviewDocument');
    expect(source.indexOf('const reusable = await findReusablePdfPreviewDocument')).toBeLessThan(source.indexOf("sb.rpc('dp_queue_pdf_preview'"));
    expect(source).toContain(".in('status', ['ready', 'partial', 'processing'])");
    expect(source).toContain(".order('pages_ready', { ascending: false })");
  });
});

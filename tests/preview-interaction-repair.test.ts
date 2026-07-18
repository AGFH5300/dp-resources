import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseSingleByteRange, ifRangeMatches } from '../lib/range-requests';
const read = (p: string) => readFileSync(p, 'utf8');

describe('preview quality and interaction repair', () => {
  it('removes student-visible technical preview copy', () => {
    const source = read('app/resource/[fileId]/resource-preview.tsx');
    for (const text of [
      'Protected',
      'Native Google Sheets preview',
      'Read-only presentation outline',
      'browser-local',
      'Visual slide fidelity',
    ])
      expect(source).not.toContain(text);
  });
  it('global search opens fresh and clears selected navigation', () => {
    const s = read('components/global-search.tsx');
    expect(s).toContain('const openSearch=()=>{clearState();setOpen(true);};');
    expect(s).toContain(
      'const resetSearch=()=>{clearState();setOpen(false);};',
    );
    expect(s).toContain('router.push(href)');
  });
  it('range parser validates single byte ranges and rejects bad requests', () => {
    expect(parseSingleByteRange('bytes=0-99', 1000)).toMatchObject({
      kind: 'range',
      header: 'bytes=0-99',
    });
    expect(parseSingleByteRange('bytes=100-', 1000)).toMatchObject({
      kind: 'range',
      header: 'bytes=100-999',
    });
    expect(parseSingleByteRange('bytes=-50', 1000)).toMatchObject({
      kind: 'range',
      header: 'bytes=950-999',
    });
    for (const r of [
      'bytes=0-1,3-4',
      'items=0-1',
      'bytes=1000-1001',
      'bytes=20-10',
      'bytes=-0',
    ])
      expect(parseSingleByteRange(r, 1000)).toMatchObject({
        kind: 'invalid',
        total: 1000,
      });
    expect(ifRangeMatches('"etag"', '"etag"')).toBe(true);
    expect(ifRangeMatches('"stale"', '"etag"')).toBe(false);
  });
  it('routes handle ranges before 304 and use safe If-Range fallback', () => {
    for (const f of [
      'app/api/resource/[fileId]/content/route.ts',
      'app/api/files/[fileId]/open/route.ts',
    ]) {
      const s = read(f);
      expect(s.indexOf('parseSingleByteRange')).toBeLessThan(
        s.indexOf('if-none-match'),
      );
      expect(s).toContain(
        "if (!requestedRange && req.headers.get('if-none-match') === etag)",
      );
      expect(s).toContain('shouldServeRange && contentRange ? 206 : 200');
    }
  });
  it('pptx outline is removed while LibreOffice is unavailable', () => {
    expect(existsSync('app/resource/[fileId]/presentation-outline.tsx')).toBe(
      false,
    );
    expect(read('lib/resource-capabilities.ts')).not.toContain('pptx-outline');
  });
  it('image preview supports pointer panning and fit reset', () => {
    const s = read('app/resource/[fileId]/resource-preview.tsx');
    const compact = s.replace(/\s+/g, '');
    expect(s).toContain('onPointerDown');
    expect(s).toContain('onPointerMove');
    expect(s).toContain('touchAction');
    expect(s).toContain('Fit image');
    expect(compact).toContain('setPan({x:0,y:0})');
  });
});

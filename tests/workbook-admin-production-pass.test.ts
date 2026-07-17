import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('workbook and admin production pass', () => {
  it('removes local spreadsheet parsing and unused worksheet metadata routes', () => {
    expect(existsSync('app/api/resource/[fileId]/workbook/route.ts')).toBe(
      false,
    );
    expect(
      existsSync('app/api/resource/[fileId]/worksheet-tabs/route.ts'),
    ).toBe(false);
    expect(read('package.json')).not.toContain('"xlsx"');
  });

  it('master workbook uses native Google Sheets embed controls without fake parsing controls', () => {
    const p = read('app/resource/[fileId]/resource-preview.tsx');
    expect(p).not.toContain('Native Google Sheets preview');
    expect(p).not.toContain('Worksheet');
    expect(p).toContain('requestFullscreen');
    expect(p).toContain('Preview unavailable');
    expect(p).not.toContain('SheetJsWorkbookPreview');
    expect(p).not.toContain('/workbook');
  });

  it('admin and library selects are app select based', () => {
    const console = read('app/admin/admin-console.tsx');
    const browser = read('app/library/library-browser.tsx');
    expect(console).toContain('AdminSelect');
    expect(browser).toContain('AppSelect');
    expect(console).not.toContain('<select');
    expect(browser).not.toContain('<select');
  });
});

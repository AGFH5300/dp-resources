import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const preview = () => readFileSync('app/resource/[fileId]/resource-preview.tsx', 'utf8');

describe('master workbook Google Sheets embed regression', () => {
  it('keeps the iframe on the published embed URL without custom gid selection', () => {
    const source = preview();

    expect(source).toContain('src={url}');
    expect(source).not.toContain('buildSheetUrl');
    expect(source).not.toContain("searchParams.set('gid'");
    expect(source).not.toContain('validActive');
    expect(source).not.toContain('initialSheet');
  });

  it('does not render or fetch a custom Worksheet selector', () => {
    const source = preview();

    expect(source).not.toContain('Native Google Sheets preview');
    expect(source).toContain('requestFullscreen');
    expect(source).not.toContain('Worksheet');
    expect(source).not.toContain('worksheet-tabs');
    expect(source).not.toContain('Use the worksheet tabs inside the sheet.');
    expect(source).not.toContain('AppSelect');
  });
});

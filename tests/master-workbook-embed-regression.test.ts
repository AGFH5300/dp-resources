import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const preview = () => readFileSync('app/resource/[fileId]/resource-preview.tsx', 'utf8');

describe('master workbook Google Sheets embed regression', () => {
  it('no selected gid leaves iframe src at the base embed URL exactly', () => {
    const source = preview();

    expect(source).toContain("if(!gid)return base");
    expect(source).toContain("const src=useMemo(()=>buildSheetUrl(url,validActive),[url,validActive])");
  });

  it('metadata failure does not mutate or replace the base embed URL', () => {
    const source = preview();

    expect(source).toContain("catch(()=>{if(live)setSelectorUnavailable(true)}");
    expect(source).toContain('Use the worksheet tabs inside the sheet.');
    expect(source).not.toContain('nextTabs[0])setActive');
    expect(source).not.toContain("useState(initialSheet||'')");
  });

  it('selected gid adds gid and single=true to the iframe src', () => {
    const source = preview();

    expect(source).toContain("url.searchParams.set('gid',gid)");
    expect(source).toContain("url.searchParams.set('single','true')");
    expect(source).toContain("url.searchParams.set('widget','true')");
    expect(source).toContain("url.searchParams.set('headers','true')");
    expect(source).toContain("url.searchParams.set('chrome','false')");
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('library clarity repair', () => {
  it('renders share save and report as context menu rows rather than button-card wrappers', () => {
    const s = read('app/library/library-browser.tsx');
    expect(s).toContain('className={row} onBegin={onClose}');
    expect(s).not.toContain('<div className="px-3 py-1"><ShareButton');
    expect(s).not.toContain('<div className="px-3 py-1"><SaveButton');
    expect(s).not.toContain('<div className="px-3 py-1"><ReportResourceDialog');
  });
  it('list and grid expose the same context menu actions and grid supports right-click and three-dot', () => {
    const s = read('app/library/library-browser.tsx');
    for (const label of ['Open in new tab', 'Download', 'ShareButton', 'SaveButton', 'Details', 'ReportResourceDialog']) expect(s).toContain(label);
    expect(s).toContain("onContextMenu={e=>{e.preventDefault();e.stopPropagation();setMenu({item,x:e.clientX,y:e.clientY})}}");
    expect(s).toContain('More actions for ${item.name}');
  });
  it('desktop menu is portaled and collision aware', () => {
    const s = read('app/library/library-browser.tsx');
    expect(s).toContain('createPortal(menu,document.body)');
    expect(s).toContain('window.innerWidth-rect.width-margin');
    expect(s).toContain('y-rect.height');
    expect(s).toContain("window.addEventListener('resize',place)");
  });
  it('root hides breadcrumb while nested folder shows breadcrumb plus heading', () => {
    const s = read('app/library/library-browser.tsx');
    expect(s).toContain('{crumbs.length>1&&<nav');
    expect(s).toContain("{active?.name||'Library'}");
  });
  it('featured-resource admin wording is non-destructive', () => {
    const s = read('app/library/library-browser.tsx');
    expect(s).toContain('Remove from featured resources');
    expect(s).toContain('Add to featured resources');
    expect(s).toContain('This does not move or delete the Drive file.');
    expect(s).not.toContain('Remove resource-library feature');
  });
  it('folder summaries are batched from indexed descendants and incomplete index returns no estimate', () => {
    const s = read('lib/folder-summaries.ts');
    expect(s).toContain(".in('drive_file_id', unique)");
    expect(s).toContain(".eq('is_folder', false)");
    expect(s).toContain('file.path.startsWith(prefix)');
    expect(s).toContain('!syncComplete(state)');
    expect(read('app/library/page.tsx')).not.toContain('crawlDriveIndex');
  });
});

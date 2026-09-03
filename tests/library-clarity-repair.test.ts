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
    const menu = read('app/library/library-browser.tsx');
    const browser = read('app/library/instant-library-browser.tsx');
    for (const label of [
      'Open in new tab',
      'Download',
      'ShareButton',
      'SaveButton',
      'Details',
      'ReportResourceDialog',
    ])
      expect(menu).toContain(label);
    expect(browser).toContain('onContextMenu={(event) =>');
    expect(browser).toContain('More actions for ${item.name}');
  });
  it('desktop menu is portaled and collision aware', () => {
    const s = read('app/library/library-browser.tsx');
    expect(s).toContain('createPortal(menu,document.body)');
    expect(s).toContain('useLayoutEffect');
    expect(s).toContain('window.visualViewport');
    expect(s).toContain("window.addEventListener('resize',place)");
  });
  it('root hides breadcrumb while nested folder shows breadcrumb plus heading', () => {
    const s = read('app/library/instant-library-browser.tsx');
    expect(s).toContain('currentCrumbs.length > 1');
    expect(s).toContain('aria-label="Breadcrumb"');
    expect(s).toContain("{active?.name || 'Library'}");
  });
  it('featured-resource admin wording is non-destructive', () => {
    const s = read('app/library/library-browser.tsx');
    expect(s).toContain('Remove from featured resources');
    expect(s).toContain('Add to featured resources');
    expect(s).toContain('This does not move or delete the Drive file.');
    expect(s).not.toContain('Remove resource-library feature');
  });
  it('folder summaries are batched from indexed descendants and can reuse a verified index state', () => {
    const s = read('lib/folder-summaries.ts');
    expect(s).toContain("sb.rpc('dp_folder_size_summaries'");
    expect(s).not.toContain(".select('path,size_bytes')");
    expect(s).not.toContain('file.path.startsWith(prefix)');
    expect(s).toContain('if (!options.indexReady)');
    expect(s).toContain('!syncComplete(state)');
    expect(read('app/library/page.tsx')).not.toContain('crawlDriveIndex');
  });
});

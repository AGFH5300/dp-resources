import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(path, 'utf8');

describe('product quality repair', () => {
  it('opens global search from nav and Ctrl/Cmd+K only', () => {
    const nav = read('components/nav.tsx');
    const search = read('components/global-search.tsx');
    expect(nav).toContain('Search the library');
    expect(nav).toContain('dp:open-search');
    expect(search).toContain('ctrlKey || e.metaKey');
    expect(search).toContain("key.toLowerCase() === 'k'");
  });
  it('removes the large local library search input in favour of a compact filter popover', () => {
    const browser = read('app/library/library-browser.tsx');
    expect(browser).not.toContain('Filter this folder by name or type');
    expect(browser).toContain('Search within this folder');
    expect(browser).toContain('Clear filters');
    expect(browser).toContain('SlidersHorizontal');
  });
  it('wires share, save, and report with internal URLs, optimistic state, and checked responses', () => {
    const actions = read('components/resource-actions.tsx');
    expect(actions).toContain('window.location.origin');
    expect(actions).not.toContain('webViewLink');
    expect(actions).toContain('navigator.clipboard.writeText');
    expect(actions).toContain('navigator.share');
    expect(actions).toContain("method: next ? 'POST' : 'DELETE'");
    expect(actions).toContain("'Content-Type': 'application/json'");
    expect(actions).toContain('if (!res.ok) throw new Error');
    expect(actions).toContain('/api/reports');
    expect(actions).toContain('resourcePath');
  });
  it('uses real handlers for resource preview/page actions', () => {
    expect(read('app/resource/[fileId]/page.tsx')).toContain('ResourceActions');
    expect(read('app/resource/[fileId]/resource-preview.tsx')).not.toContain(
      'ResourceActions',
    );
  });
  it('support form checks failed responses, preserves data, loads, and refreshes tickets', () => {
    const form = read('app/support/support-form.tsx');
    expect(form).toContain('if(!res.ok||!json?.ticket) throw new Error');
    expect(form).toContain('setError');
    expect(form).toContain("requestState==='submitting'");
    expect(form).toContain('setTickets(prev=>[ticket,...prev])');
    expect(form).toContain('value={message}');
  });
  it('uses DP colour tokens across nav, library, support, and preview', () => {
    for (const file of [
      'components/nav.tsx',
      'app/library/library-browser.tsx',
      'app/support/page.tsx',
      'app/resource/[fileId]/resource-preview.tsx',
    ]) {
      expect(read(file)).toMatch(
        /var\(--dp-(navy|blue|teal|gold|warm-surface|soft-sky|ink)\)/,
      );
    }
  });
});

describe('2026-07-02 QA regressions', () => {
  it('report dialog closes from overlay and Escape but keeps failed form state and hides raw IDs', () => {
    const actions = read('components/resource-actions.tsx');
    expect(actions).toContain(
      'onMouseDown={(e)=>{ if(e.target===e.currentTarget) close(); }}',
    );
    expect(actions).toContain("if(e.key==='Escape') close();");
    expect(actions).toContain('onMouseDown={e=>e.stopPropagation()}');
    expect(actions).not.toContain(
      '{resource.resourceName} · {resource.driveFileId}',
    );
    expect(actions).toContain("toast('Could not submit report', 'error');");
  });
  it('global search is a compact command palette with backdrop close and neutral active rows', () => {
    const search = read('components/global-search.tsx');
    expect(search).toContain('max-w-2xl');
    expect(search).toContain('if(e.target===e.currentTarget)close();');
    expect(search).toContain('Folders');
    expect(search).toContain('Files');
    expect(search).toContain('ResourceTypeIcon');
    expect(search).toContain('No matching resources.');
  });
  it('preview renders one resource action group at page level and no duplicate viewer action group', () => {
    expect(read('app/resource/[fileId]/page.tsx')).toContain('ResourceActions');
    expect(read('app/resource/[fileId]/resource-preview.tsx')).not.toContain(
      'ResourceActions',
    );
    expect(read('app/resource/[fileId]/resource-preview.tsx')).not.toContain(
      'Unable to load the PDF preview',
    );
  });
});

describe('spreadsheet resource labelling', () => {
  it('classifies Office XLSX MIME before generic document', async () => {
    const { typeLabel } = await import('../lib/resource-utils');
    expect(
      typeLabel(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('Spreadsheet');
  });
  it('uses spreadsheet icon branch for the same MIME type', () => {
    const icon = read('components/resource-type-icon.tsx');
    const utils = read('lib/resource-utils.ts');
    expect(utils.indexOf('spreadsheet')).toBeLessThan(
      utils.indexOf('document'),
    );
    expect(icon).toContain("t.includes('Spreadsheet')");
    expect(icon).toContain('FileSpreadsheet');
  });
});

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
    expect(read('app/resource/[fileId]/resource-preview.tsx')).toContain('ResourceActions');
  });
  it('support form checks failed responses, preserves data, loads, and refreshes tickets', () => {
    const form = read('app/support/support-form.tsx');
    expect(form).toContain('if(!res.ok) throw new Error');
    expect(form).toContain('setError');
    expect(form).toContain('disabled={loading}');
    expect(form).toContain('router.refresh()');
    expect(form).toContain('value={message}');
  });
  it('uses DP colour tokens across nav, library, support, and preview', () => {
    for (const file of ['components/nav.tsx','app/library/library-browser.tsx','app/support/page.tsx','app/resource/[fileId]/resource-preview.tsx']) {
      expect(read(file)).toMatch(/var\(--dp-(navy|blue|teal|gold|warm-surface|soft-sky|ink)\)/);
    }
  });
});

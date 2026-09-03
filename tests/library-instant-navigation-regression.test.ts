import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Library instant navigation regression coverage', () => {
  it('keeps folder transitions inside the mounted Library browser', () => {
    const browser = read('app/library/instant-library-browser.tsx');

    expect(browser).toContain('window.history.pushState');
    expect(browser).toContain("window.addEventListener('popstate'");
    expect(browser).toContain('setLocalItems(cached.items)');
    expect(browser).toContain("fetch('/api/library/folder-window'");
    expect(browser).toContain('inFlightRef.current');
  });

  it('does not reparent React-owned Library navigation nodes', () => {
    const folderSearch = read('components/folder-search-button.tsx');
    const activityLinks = read('components/admin/activity-user-links.tsx');

    expect(folderSearch).not.toContain('insertBefore(');
    expect(folderSearch).not.toContain('appendChild(');
    expect(folderSearch).not.toContain('removeChild(');
    expect(activityLinks).not.toContain('replaceChildren(');
    expect(activityLinks).not.toContain('removeChild(');
  });

  it('keeps missing-folder failures inside the mounted Library instead of crashing the route', () => {
    const browser = read('app/library/instant-library-browser.tsx');
    expect(browser).toContain('We could not load this folder. Please try again.');
    expect(browser).toContain('Retry');
  });
});

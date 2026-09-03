import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Library proactive loading', () => {
  it('ships current and one-hop child folder data with the initial Library view', () => {
    const page = read('app/library/page.tsx');
    const indexed = read('lib/indexed-folder-view.ts');

    expect(page).toContain('getIndexedFolderWindow(folder)');
    expect(page).toContain('<InstantLibraryBrowser');
    expect(page).toContain('prefetchedFolders={prefetchedFolders}');
    expect(page).not.toContain('<LibraryFolderPrefetch');
    expect(indexed).toContain('const MAX_PREFETCH_FOLDERS = 32;');
    expect(indexed).toContain(".in('parent_drive_file_id', prefetchFolderIds)");
    expect(indexed).toContain('prefetched[prefetchedFolderId]');
  });

  it('loads missing folder windows through one authenticated JSON endpoint', () => {
    const route = read('app/api/library/folder-window/route.ts');
    const browser = read('app/library/instant-library-browser.tsx');

    expect(route).toContain('await requireMember();');
    expect(route).toContain('getIndexedFolderWindow(folderId)');
    expect(route).toContain('favoriteIds');
    expect(route).toContain("'Cache-Control': 'private, no-store'");
    expect(browser).toContain("fetch('/api/library/folder-window'");
    expect(browser).toContain('inFlightRef.current');
    expect(browser).toContain('cacheRef.current');
  });

  it('uses native history for instant folder transitions and supports browser back/forward', () => {
    const browser = read('app/library/instant-library-browser.tsx');

    expect(browser).toContain('window.history.pushState');
    expect(browser).toContain("window.addEventListener('popstate'");
    expect(browser).toContain("historyMode: 'push' | 'none'");
    expect(browser).toContain('setLocalItems(cached.items)');
    expect(browser).toContain('<FolderLoadingRows />');
  });

  it('does not launch the previous route-prefetch plus warm-request storm', () => {
    const page = read('app/library/page.tsx');
    const warmup = read('components/library-route-warmup.tsx');

    expect(page).not.toContain('LibraryFolderPrefetch');
    expect(warmup).toContain("router.prefetch('/library')");
    expect(warmup).not.toContain("fetch('/api/library/warm'");
    expect(warmup).not.toContain('keepalive: true');
    expect(warmup).toContain('const WARM_TTL_MS = 45_000;');
  });

  it('collapses breadcrumb ancestry and duplicate sync-state work', () => {
    const indexed = read('lib/indexed-folder-view.ts');
    const summaries = read('lib/folder-summaries.ts');

    expect(indexed).toContain(".in('path', paths)");
    expect(indexed).not.toContain('while (');
    expect(indexed).toContain('indexReadyCached');
    expect(indexed).toContain(
      'getIndexedFolderSizeSummaries(currentFolderIds, { indexReady: true })',
    );
    expect(indexed).not.toContain(
      'getIndexedFolderSizeSummaries(allFolderIds',
    );
    expect(summaries).toContain('options: { indexReady?: boolean } = {}');
  });

  it('shows a compact stable folder shape while truly uncached data is loading', () => {
    const loading = read('app/library/loading.tsx');
    const browser = read('app/library/instant-library-browser.tsx');

    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('Array.from({ length: 8 })');
    expect(browser).toContain('aria-label="Loading folder"');
    expect(browser).toContain('Array.from({ length: 6 })');
  });
});

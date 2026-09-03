import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Library proactive loading', () => {
  it('warms only visible child folders in bounded background batches', () => {
    const page = read('app/library/page.tsx');
    const prefetch = read('app/library/library-folder-prefetch.tsx');

    expect(page).toContain('<LibraryFolderPrefetch');
    expect(page).toContain('.filter((item) => item.isFolder)');
    expect(prefetch).toContain('const FIRST_BATCH_SIZE = 6;');
    expect(prefetch).toContain('const NEXT_BATCH_SIZE = 4;');
    expect(prefetch).toContain("fetch('/api/library/warm'");
    expect(prefetch).toContain('router.prefetch(`/library?folder=${encodeURIComponent(folderId)}`)');
    expect(prefetch).toContain('keepalive: true');
    expect(prefetch).toContain("connection?.effectiveType === '2g'");
    expect(prefetch).toContain('connection?.saveData');
  });

  it('warms the shared indexed-folder cache behind authenticated access', () => {
    const route = read('app/api/library/warm/route.ts');

    expect(route).toContain('await requireMember();');
    expect(route).toContain('const MAX_FOLDER_IDS = 18;');
    expect(route).toContain('const WARM_CONCURRENCY = 2;');
    expect(route).toContain('getIndexedFolderView(folderId)');
    expect(route).toContain("'Cache-Control': 'no-store'");
  });

  it('warms the Library root from normal authenticated navigation and the signed-in homepage', () => {
    const nav = read('components/nav.tsx');
    const home = read('app/page.tsx');
    const warmup = read('components/library-route-warmup.tsx');

    expect(nav).toContain('<LibraryRouteWarmup />');
    expect(home).toContain('{isSignedIn ? <LibraryRouteWarmup /> : null}');
    expect(warmup).toContain("pathname.startsWith('/library')");
    expect(warmup).toContain("router.prefetch('/library')");
    expect(warmup).toContain("fetch('/api/library/warm'");
    expect(warmup).toContain('keepalive: true');
    expect(warmup).toContain('const WARM_TTL_MS = 45_000;');
    expect(warmup).not.toContain('controller.abort()');
  });

  it('shows the current compact Library shape immediately while uncached data is loading', () => {
    const loading = read('app/library/loading.tsx');

    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('Array.from({ length: 8 })');
    expect(loading).toContain('Loading Library');
    expect(loading).toContain('grid-cols-[minmax(260px,1fr)_220px_120px_120px_90px_56px]');
  });

  it('records the 3 September reliability and proactive-loading release in the changelog', () => {
    const changelog = read('app/changelog/page.tsx');

    expect(changelog).toContain('release-2026-09-03-library-proactive-loading');
    expect(changelog).toContain('preloading likely next folders in the background');
    expect(changelog).toContain('release-2026-09-03-library-hydration-reliability');
    expect(changelog).toContain('intermittent first-load Library failure');
  });
});

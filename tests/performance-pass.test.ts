import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('performance pass regressions', () => {
  it('folder navigation swaps cached views without an App Router round trip', () => {
    const src = read('app/library/instant-library-browser.tsx');
    expect(src).toContain('window.history.pushState');
    expect(src).toContain("window.addEventListener('popstate'");
    expect(src).toContain("fetch('/api/library/folder-window'");
    expect(src).toContain('cacheRef.current.get(folderId)');
    expect(src).toContain('if (item.isFolder)');
    expect(src).toContain('openFolder(item)');
    expect(src).not.toContain('router.push(hrefForFolder');
  });

  it('folder hover warms targeted JSON windows instead of prefetching every RSC route', () => {
    const src = read('app/library/instant-library-browser.tsx');
    expect(src).toContain('hydrateFolderWindow');
    expect(src).toContain("fetch('/api/library/folder-window'");
    expect(src).toContain('setTimeout');
    expect(src).toContain('100');
    expect(src).toContain('router.prefetch(hrefFor(item, rootId))');
  });

  it('incomplete index does not claim complete', () => {
    const src = read('lib/indexed-resource.ts');
    expect(src).toContain("state?.status === 'complete'");
    expect(src).toContain('Boolean(state?.completed_at)');
    expect(src).toContain(
      '!Array.isArray(state?.folder_queue) || state.folder_queue.length === 0',
    );
    expect(src).toContain('getResourceIndexSnapshot');
    expect(read('lib/indexed-folder-view.ts')).toContain(
      'if (!snapshot.ready || !snapshot.revision) return null',
    );
    expect(read('lib/index-sync.ts')).toContain("status: 'paused'");
  });

  it('complete index window is attempted before live Drive browsing', () => {
    const src = read('app/library/page.tsx');
    expect(src.indexOf('getIndexedFolderWindow(folder)')).toBeLessThan(
      src.indexOf('getFolderView(folder)'),
    );
  });

  it('admin index section does not query unrelated queues', () => {
    const src = read('app/admin/page.tsx');
    const indexBlock = src.slice(
      src.indexOf("section === 'index'"),
      src.indexOf("section === 'reports'"),
    );
    expect(indexBlock).toContain('getIndexSyncStatus');
    expect(indexBlock).not.toContain('dp_resource_reports');
    expect(indexBlock).not.toContain('dp_support_tickets');
    expect(indexBlock).not.toContain('dp_resource_activity_logs');
  });

  it('admin reports section loads admins but not activity/users pages', () => {
    const src = read('app/admin/page.tsx');
    const reportsBlock = src.slice(
      src.indexOf("section === 'reports'"),
      src.indexOf("section === 'tickets'"),
    );
    expect(reportsBlock).toContain('dp_resource_reports');
    expect(reportsBlock).toContain('loadAdmins');
    expect(reportsBlock).not.toContain('dp_resource_activity_logs');
  });

  it('protected content uses private cache validators and authenticates first', () => {
    const src = read('app/api/resource/[fileId]/content/route.ts');
    expect(src.indexOf('requireMember()')).toBeLessThan(
      src.indexOf('const media = await getDriveStream'),
    );
    expect(src).toContain(
      "'cache-control': 'private, max-age=300, must-revalidate'",
    );
    expect(src).toContain("'vary': 'Cookie'");
    expect(src).toContain('if-none-match');
    expect(src).toContain('status: 304');
  });
});

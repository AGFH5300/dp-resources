import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('performance pass regressions', () => {
  it('library navigation avoids document reloads and uses router push', () => {
    const src = read('app/library/library-browser.tsx');
    expect(src).toContain("useRouter()")
    expect(src).toContain('router.push(href)')
    expect(src).not.toContain('window.location.href=href')
  })

  it('library route prefetch only prefetches page routes after a delay', () => {
    const src = read('app/library/library-browser.tsx');
    expect(src).toContain('setTimeout')
    expect(src).toContain('150')
    expect(src).toContain('router.prefetch(href)')
    expect(src).not.toContain('/api/resource/${fileId}/content')
  })

  it('incomplete index does not claim complete', () => {
    const src = read('lib/indexed-folder-view.ts');
    expect(src).toContain("state?.status === 'complete'")
    expect(src).toContain('Boolean(state?.completed_at)')
    expect(src).toContain('queued === 0')
    expect(read('lib/index-sync.ts')).toContain("status: 'paused'")
  })

  it('complete index is attempted before live Drive browsing', () => {
    const src = read('app/library/page.tsx');
    expect(src.indexOf('getIndexedFolderView(folder)')).toBeLessThan(src.indexOf('getFolderView(folder)'))
  })

  it('admin index section does not query unrelated queues', () => {
    const src = read('app/admin/page.tsx');
    const indexBlock = src.slice(src.indexOf("section === 'index'"), src.indexOf("section === 'reports'"));
    expect(indexBlock).toContain('getIndexSyncStatus')
    expect(indexBlock).not.toContain('dp_resource_reports')
    expect(indexBlock).not.toContain('dp_support_tickets')
    expect(indexBlock).not.toContain('dp_resource_activity_logs')
  })

  it('admin reports section loads admins but not activity/users pages', () => {
    const src = read('app/admin/page.tsx');
    const reportsBlock = src.slice(src.indexOf("section === 'reports'"), src.indexOf("section === 'tickets'"));
    expect(reportsBlock).toContain("dp_resource_reports")
    expect(reportsBlock).toContain('loadAdmins')
    expect(reportsBlock).not.toContain('dp_resource_activity_logs')
  })

  it('protected content uses private cache validators and authenticates first', () => {
    const src = read('app/api/resource/[fileId]/content/route.ts');
    expect(src.indexOf('requireMember()')).toBeLessThan(src.indexOf('const media = await getDriveStream'))
    expect(src).toContain("'cache-control': 'private, max-age=300, must-revalidate'")
    expect(src).toContain("'vary': 'Cookie'")
    expect(src).toContain('if-none-match')
    expect(src).toContain('status: 304')
  })
})

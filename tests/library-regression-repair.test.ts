import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('remaining library regressions repair', () => {
  it('bottom-right context menu is portaled, fixed, positioned before paint, and exposes every action', () => {
    const s = read('app/library/library-browser.tsx');
    expect(s).toContain('createPortal(menu,document.body)');
    expect(s).toContain('useLayoutEffect');
    expect(s).toContain("visibility:positioned?'visible':'hidden'");
    expect(s).toContain("pointerEvents:positioned?'auto':'none'");
    expect(s).toContain('"fixed z-50 min-w-56 rounded-md');
    for (const action of [
      'Open in new tab',
      'Download',
      'ShareButton',
      'SaveButton',
      'Details',
      'ReportResourceDialog',
    ]) {
      expect(s).toContain(action);
    }
  });

  it('desktop context menu clamps to the visual viewport and scrolls internally when too tall', () => {
    const s = read('app/library/library-browser.tsx');
    expect(s).toContain('window.visualViewport');
    expect(s).toContain('document.documentElement.clientWidth');
    expect(s).toContain('document.documentElement.clientHeight');
    expect(s).toContain('const margin=8');
    expect(s).toContain('left=Math.min(Math.max(left,minLeft)');
    expect(s).toContain('top=Math.min(Math.max(top,minTop)');
    expect(s).toContain("maxHeight:'calc(100dvh - 16px)'");
    expect(s).toContain("maxWidth:'calc(100dvw - 16px)'");
    expect(s).toContain("overflowY:'auto'");
    expect(s).toContain(
      "window.visualViewport?.addEventListener('resize',place)",
    );
    expect(s).toContain(
      "window.visualViewport?.addEventListener('scroll',place)",
    );
  });

  it('folder-size calculation uses one database-side RPC and never fetches descendant rows into JavaScript', () => {
    const s = read('lib/folder-summaries.ts');
    expect(s).toContain("sb.rpc('dp_folder_size_summaries'");
    expect(s).not.toContain(".select('path,size_bytes')");
    expect(s).not.toContain('file.path.startsWith(prefix)');
    expect(s).not.toContain('.or(or)');
    expect(s).toContain('!syncComplete(state)');
  });

  it('folder-size SQL aggregates batches safely without wildcard matching or row limits', () => {
    const sql = read(
      'supabase/migrations/20260707120000_folder_size_summaries_rpc.sql',
    );
    const normalized = sql.toLowerCase();

    expect(
      normalized.includes(
        'create or replace function public.dp_folder_size_summaries(folder_ids text[])',
      ),
    ).toBe(true);
    expect(normalized.includes('join unnest(folder_ids)')).toBe(true);
    expect(
      normalized.includes(
        'sum(file.size_bytes) filter (where file.size_bytes is not null)',
      ),
    ).toBe(true);
    expect(normalized.includes('count(file.drive_file_id)')).toBe(true);
    expect(normalized.includes('count(file.size_bytes)')).toBe(true);
    expect(
      normalized.includes(
        "left(file.path, length(folder.path) + 3) = folder.path || ' / '",
      ),
    ).toBe(true);
    expect(normalized.includes(' like ')).toBe(false);
    expect(normalized.includes(' ilike ')).toBe(false);
    expect(normalized.includes('limit ')).toBe(false);
    expect(normalized.includes('group by folder.drive_file_id')).toBe(true);
    expect(normalized.includes('having coalesce(sum(file.size_bytes)')).toBe(true);
  });

  it('folder-size RPC is narrowly executable by service_role only', () => {
    const sql = read(
      'supabase/migrations/20260707120000_folder_size_summaries_rpc.sql',
    );
    expect(
      sql.includes(
        'revoke all on function public.dp_folder_size_summaries(text[]) from public',
      ),
    ).toBe(true);
    expect(
      sql.includes(
        'revoke all on function public.dp_folder_size_summaries(text[]) from anon',
      ),
    ).toBe(true);
    expect(
      sql.includes(
        'revoke all on function public.dp_folder_size_summaries(text[]) from authenticated',
      ),
    ).toBe(true);
    expect(
      sql.includes(
        'grant execute on function public.dp_folder_size_summaries(text[]) to service_role',
      ),
    ).toBe(true);
  });

  it('visible-folder batching and no-estimate behavior are preserved', () => {
    const indexed = read('lib/indexed-folder-view.ts');
    const summaries = read('lib/folder-summaries.ts');
    expect(indexed.includes('const visibleFolderIds = childRows')).toBe(true);
    expect(indexed.includes('getIndexedFolderSizeSummaries(visibleFolderIds')).toBe(
      true,
    );
    expect(summaries.includes('new Map<string, number>()')).toBe(true);
    expect(summaries.includes('if (total > 0) result.set')).toBe(true);
  });
});

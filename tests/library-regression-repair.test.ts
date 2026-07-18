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
    expect(s).toContain(
      "sb.rpc('dp_folder_size_summaries', { folder_ids: unique })",
    );
    expect(s).not.toContain(".select('path,size_bytes')");
    expect(s).not.toContain('file.path.startsWith(prefix)');
    expect(s).not.toContain('.or(or)');
    expect(s).toContain('!syncComplete(state)');
  });

  it('folder-size SQL aggregates batches safely, including more than 1,000 rows and special folder names', () => {
    const sql = read(
      'supabase/migrations/20260707120000_folder_size_summaries_rpc.sql',
    );
    expect(sql).toContain(
      'create or replace function public.dp_folder_size_summaries(folder_ids text[])',
    );
    expect(sql).toContain('join unnest(folder_ids)');
    expect(sql).toContain(
      'sum(file.size_bytes) filter (where file.size_bytes is not null)',
    );
    expect(sql).toContain('count(file.drive_file_id)');
    expect(sql).toContain('count(file.size_bytes)');
    expect(sql).toContain(
      "left(file.path, length(folder.path) + 3) = folder.path || ' / '",
    );
    expect(sql).not.toMatch(/like|ilike/i);
    expect(sql).not.toContain('limit 1000');
    expect(sql).not.toContain('limit');
    expect(sql).toContain('group by folder.drive_file_id');
    expect(sql).toContain('having coalesce(sum(file.size_bytes)');
  });

  it('folder-size RPC is narrowly executable by service_role only', () => {
    const sql = read(
      'supabase/migrations/20260707120000_folder_size_summaries_rpc.sql',
    );
    expect(sql).toContain(
      'revoke all on function public.dp_folder_size_summaries(text[]) from public',
    );
    expect(sql).toContain(
      'revoke all on function public.dp_folder_size_summaries(text[]) from anon',
    );
    expect(sql).toContain(
      'revoke all on function public.dp_folder_size_summaries(text[]) from authenticated',
    );
    expect(sql).toContain(
      'grant execute on function public.dp_folder_size_summaries(text[]) to service_role',
    );
  });

  it('visible-folder batching and no-estimate behavior are preserved', () => {
    expect(read('lib/indexed-folder-view.ts')).toContain(
      'filter((r) => r.is_folder).map((r) => r.drive_file_id)',
    );
    const summaries = read('lib/folder-summaries.ts');
    expect(summaries).toContain('new Map<string, number>()');
    expect(summaries).toContain('if (total > 0) result.set');
  });
});

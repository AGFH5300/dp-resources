import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
const read = (p: string) => readFileSync(p, 'utf8');

describe('deployment completion pass', () => {
  it('uses chronological migration names and no obsolete V2 filename', () => {
    const migrations = readdirSync('supabase/migrations').sort();
    expect(migrations).toContain('20260702043000_resource_workspace_v2.sql');
    expect(migrations).toContain(
      '20260702050000_resource_index_sync_state.sql',
    );
    expect(migrations).toContain(
      '20260815114500_index_sync_command_center.sql',
    );
    expect(migrations).not.toContain(
      '20260701123000_resource_workspace_v2.sql',
    );
    expect(
      migrations.indexOf('20260702043000_resource_workspace_v2.sql'),
    ).toBeLessThan(
      migrations.indexOf('20260702050000_resource_index_sync_state.sql'),
    );
  });

  it('implements resumable live indexing with persisted queue and stale cleanup after completion', () => {
    const sync = read('lib/index-sync.ts');
    const crawler = read('lib/index-crawler.ts');
    expect(sync).toContain('folder_queue');
    expect(sync).toContain('last_seen_sync_run_id');
    expect(sync).toContain("status: 'complete'");
    expect(sync).toContain('last_seen_sync_run_id.is.null');
    expect(sync).toContain('lock_token.is.null');
    expect(sync).toContain('phase: \'finalizing\'');
    expect(crawler).toContain('crawlDriveIndexChunkLive');
    expect(crawler).toContain('onWave');
    expect(crawler).toContain('listDriveIndexPage(folder, 1000)');
  });

  it('shows incomplete search notice without Drive recursive fallback', () => {
    const page = read('app/search/page.tsx');
    const route = read('app/api/search/route.ts');
    expect(page).toContain(
      'Library indexing is in progress. Results may be incomplete.',
    );
    expect(route).not.toContain('crawlDriveIndex');
  });

  it('exposes PDF, spreadsheet, CSV, DOCX and scoped image preview controls', () => {
    const p = read('app/resource/[fileId]/resource-preview.tsx');
    expect(p).toContain('PdfViewer');
    expect(p).toContain('Fit image');
    expect(p).toContain('Zoom in');
    expect(read('app/resource/[fileId]/page.tsx')).toContain('openHref');
    expect(p).toContain('Preview unavailable');
    expect(p).toContain('CsvTable');
    expect(p).toContain('absolute bottom-4');
    expect(p).not.toContain('fixed bottom');
  });

  it('supports admin ticket/report status notes', () => {
    expect(read('app/api/admin/support/[id]/route.ts')).toContain(
      'admin_notes',
    );
    expect(read('app/api/admin/reports/[id]/route.ts')).toContain(
      'admin_notes',
    );
    expect(
      read('supabase/migrations/20260702050000_resource_index_sync_state.sql'),
    ).toContain('admin_notes');
  });
});

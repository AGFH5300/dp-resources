import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mergeRecentResources,
  recentResourcesFromActivity,
} from '../lib/recent-resources';

const read = (path: string) => readFileSync(path, 'utf8');

describe('recent resources', () => {
  it('deduplicates newest-first activity and enriches it from the resource index', () => {
    const recent = recentResourcesFromActivity(
      [
        {
          file_id: 'file-1',
          file_name: 'Old name',
          action: 'file_opened',
          created_at: '2026-07-18T10:00:00.000Z',
        },
        {
          file_id: 'folder-1',
          file_name: 'Folder',
          action: 'folder_opened',
          created_at: '2026-07-18T09:00:00.000Z',
        },
        {
          file_id: 'file-1',
          file_name: 'Older duplicate',
          action: 'file_opened',
          created_at: '2026-07-18T08:00:00.000Z',
        },
        {
          file_id: 'download-1',
          file_name: 'Download only',
          action: 'download_started',
          created_at: '2026-07-18T07:00:00.000Z',
        },
      ],
      [
        {
          drive_file_id: 'file-1',
          name: 'Current name.pdf',
          mime_type: 'application/pdf',
          is_folder: false,
          path: 'Library / Notes',
        },
      ],
    );

    expect(recent.map((item) => item.id)).toEqual(['file-1', 'folder-1']);
    expect(recent[0]).toMatchObject({
      name: 'Current name.pdf',
      path: 'Library / Notes',
      isFolder: false,
    });
    expect(recent[1]).toMatchObject({
      name: 'Folder',
      isFolder: true,
    });
  });

  it('merges server and device history by the actual latest open time', () => {
    const base = {
      name: 'Resource',
      isFolder: false,
      mimeType: 'application/pdf',
      path: 'Library',
    };
    expect(
      mergeRecentResources(
        [{ ...base, id: 'a', at: 10 }],
        [
          { ...base, id: 'a', at: 30 },
          { ...base, id: 'b', at: 20 },
        ],
      ).map((item) => [item.id, item.at]),
    ).toEqual([
      ['a', 30],
      ['b', 20],
    ]);
  });

  it('records mounted resources and folders and loads server activity for Recent', () => {
    const page = read('app/recent/page.tsx');
    const client = read('app/recent/recent-client.tsx');
    const resource = read('app/resource/[fileId]/page.tsx');
    const browser = read('app/library/library-browser.tsx');
    const activity = read('lib/activity.ts');
    const route = read('app/api/recent/open/route.ts');
    expect(page).toContain(".in('action', ['file_opened', 'folder_opened'])");
    expect(page).toContain(".order('created_at', { ascending: false })");
    expect(page).toContain('recentResourcesFromActivity');
    expect(client).toContain('mergeRecentResources(initialRows');
    expect(resource).toContain('<RecentResourceRecorder');
    expect(browser).toContain("fetch('/api/library/open-folder'");
    expect(read('components/recent-resource-recorder.tsx')).toContain(
      "fetch('/api/recent/open'",
    );
    expect(route).toContain('sameOriginOrForbidden(req)');
    expect(route).toContain('await requireMember()');
    expect(route).toContain('assertInsideRoot(fileId)');
    expect(activity).toContain('Unable to record resource activity');
  });
});

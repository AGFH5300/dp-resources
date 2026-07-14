import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Render Free PDF preview preparation', () => {
  it('exposes a manual workflow for one exact Drive PDF', () => {
    const workflow = read('.github/workflows/prepare-pdf-previews.yml');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('drive_file_id:');
    expect(workflow).toContain('poppler-utils');
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('scripts/prepare-pdf-preview.mjs');
    expect(workflow).toContain('secrets.SUPABASE_SERVICE_ROLE_KEY');
    expect(workflow).toContain('secrets.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  });

  it('queues and prepares only the selected Drive file', () => {
    const queue = read('scripts/queue-pdf-previews.mjs');
    const prepare = read('scripts/prepare-pdf-preview.mjs');
    expect(queue).toContain('--drive-file-id=');
    expect(queue).toContain(".eq('drive_file_id', driveFileId)");
    expect(queue).toContain('No indexed PDF was found for Drive file ID');
    expect(prepare).toContain("'scripts/pdf-preview-worker.mjs', '--once'");
    expect(prepare).toContain("queued_at: priorityTime");
    expect(prepare).toContain("completed.status !== 'ready'");
  });

  it('keeps an authenticated standard-reader escape hatch for unprepared PDFs', () => {
    const preview = read('app/resource/[fileId]/resource-preview.tsx');
    expect(preview).toContain('Preview not prepared? Open standard reader');
    expect(preview).toContain('target="_blank"');
    expect(preview).toContain('rel="noreferrer"');
    expect(preview).toContain('`/api/resource/${fileId}/content`');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('index sync panel request sequencing', () => {
  it('runs POST chunks sequentially but polls status independently every second while active', () => {
    const panel = read('app/admin/index-sync-panel.tsx');
    expect(panel).toContain('postInFlightRef.current');
    expect(panel).toContain('refreshInFlightRef.current');
    expect(panel).toContain(
      'if (postInFlightRef.current || !autoRunRef.current) return',
    );
    expect(panel).toContain(
      "await fetch('/api/admin/index', { method: 'POST' })",
    );
    expect(panel).toContain('setInterval(refresh, active ? 1000 : 5000)');
    expect(panel).toContain('setTimeout(runNextChunk, 120)');
    expect(panel).not.toContain('setInterval(async');
  });

  it('shows live progress, ETA, throughput and readable indexing phases', () => {
    const panel = read('app/admin/index-sync-panel.tsx');
    expect(panel).toContain('Library index command center');
    expect(panel).toContain('Live progress');
    expect(panel).toContain('Throughput');
    expect(panel).toContain('Estimated ETA');
    expect(panel).toContain('Scanning the Drive library…');
    expect(panel).toContain('Writing the latest Drive batch to the index…');
    expect(panel).toContain(
      'Finalizing the index and refreshing source inheritance…',
    );
    expect(panel).toContain('Library index is fully synchronized.');
    expect(panel).toContain('Sync interrupted');
  });

  it('keeps auto-continuation through a reload and exposes a safe pause control', () => {
    const panel = read('app/admin/index-sync-panel.tsx');
    expect(panel).toContain("sessionStorage.setItem('dp-index-autocontinue', '1')");
    expect(panel).toContain("sessionStorage.getItem('dp-index-autocontinue')");
    expect(panel).toContain('Pause after this batch');
    expect(panel).toContain('Pause indexing');
    expect(panel).toContain('Resume indexing');
  });
});

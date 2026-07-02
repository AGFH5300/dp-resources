import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('index sync panel request sequencing', () => {
  it('uses a sequential timeout loop instead of overlapping intervals for POST chunks', () => {
    const panel = read('app/admin/index-sync-panel.tsx');
    expect(panel).toContain('inFlightRef.current');
    expect(panel).toContain('if (inFlightRef.current) return');
    expect(panel).toContain('await fetch(\'/api/admin/index\', { method: \'POST\' })');
    expect(panel).toContain('setTimeout(runNextChunk, 1500)');
    expect(panel).not.toContain('setInterval(async');
  });

  it('shows readable indexing states', () => {
    const panel = read('app/admin/index-sync-panel.tsx');
    expect(panel).toContain('Preparing library index…');
    expect(panel).toContain('Indexing ${data.state.indexed_resources.toLocaleString()} resources…');
    expect(panel).toContain('folders remaining');
    expect(panel).toContain('Index complete');
    expect(panel).toContain('Sync interrupted — Resume indexing');
    expect(panel).toContain('Another sync is already running');
    expect(panel).toContain('disabled={inFlight || status === \'indexing\'}');
  });
});

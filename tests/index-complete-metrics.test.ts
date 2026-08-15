import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/admin/index-sync-panel.tsx', 'utf8');

describe('completed index metrics', () => {
  it('freezes run duration at completed_at instead of the live clock', () => {
    expect(source).toContain("status === 'complete' && state?.completed_at");
    expect(source).toContain("new Date(state.completed_at).getTime()");
    expect(source).toContain('runEndMs - new Date(state.started_at).getTime()');
  });

  it('shows zero seconds for a completed ETA', () => {
    expect(source).toContain("if (seconds === 0) return '0 sec';");
  });

  it('uses whole-run average throughput after completion', () => {
    expect(source).toContain('completedAverageSpeed');
    expect(source).toContain('currentRunItems / elapsedSeconds');
    expect(source).toContain('processedFolders / elapsedSeconds');
    expect(source).toContain('displaySpeed');
    expect(source).toContain("status === 'complete' ? 'Run average' : 'Current speed'");
    expect(source).toContain("status === 'complete' ? 'Run duration' : 'Run elapsed'");
  });
});

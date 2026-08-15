import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('admin index visual restraint', () => {
  it('softens the metric-grid dividers instead of leaving bright slate divides in dark mode', () => {
    const css = read('app/admin/admin-theme-compat.css');
    expect(css).toContain("[class~='divide-slate-100'][class~='sm:divide-x']");
    expect(css).toContain('var(--dp-theme-border) 34%');
  });

  it('softens the progress-track ring in both themes', () => {
    const css = read('app/admin/admin-theme-compat.css');
    expect(css).toContain("[role='progressbar'][class~='ring-slate-200']");
    expect(css).toContain('--tw-ring-color');
    expect(css).toContain('var(--dp-theme-border) 28%');
  });
});

describe('admin index crawler throughput', () => {
  it('uses a continuous request pool instead of synchronized waves', () => {
    const crawler = read('lib/index-crawler.ts');
    expect(crawler).toContain('const inFlight = new Map');
    expect(crawler).toContain('fillWorkerPool');
    expect(crawler).toContain('Promise.race(inFlight.values())');
    expect(crawler).not.toContain('const wave = queue.splice');
  });

  it('does not block Drive crawling on every telemetry heartbeat', () => {
    const crawler = read('lib/index-crawler.ts');
    expect(crawler).toContain('telemetryInFlight');
    expect(crawler).toContain('publishProgress();');
    expect(crawler).toContain('Telemetry is observability, not indexing correctness');
  });

  it('keeps the safe eight-request Drive concurrency ceiling', () => {
    const crawler = read('lib/index-crawler.ts');
    expect(crawler).toContain('Math.min(Math.max(options.concurrency ?? 8, 1), 8)');
  });
});

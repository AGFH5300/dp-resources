import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('admin index theme compatibility', () => {
  it('loads the admin-only compatibility stylesheet from the admin layout', () => {
    expect(read('app/admin/layout.tsx')).toContain("import './admin-theme-compat.css';");
  });

  it('maps composite light surfaces used by the index command center into dark theme tokens', () => {
    const css = read('app/admin/admin-theme-compat.css');
    expect(css).toContain('.bg-gradient-to-br.from-white.via-white.to-slate-50');
    expect(css).toContain("[class~='bg-slate-50/70']");
    expect(css).toContain('var(--dp-page)');
    expect(css).toContain('var(--dp-surface-muted)');
  });

  it('covers the command-center rose and sky status utilities in dark mode', () => {
    const css = read('app/admin/admin-theme-compat.css');
    for (const utility of [
      "[class~='bg-rose-50']",
      "[class~='border-rose-200']",
      "[class~='text-rose-700']",
      "[class~='bg-sky-50']",
      "[class~='border-sky-200']",
      "[class~='text-sky-700']",
    ]) {
      expect(css).toContain(utility);
    }
  });

  it('keeps the dark progress fill visible against the dark progress track', () => {
    const css = read('app/admin/admin-theme-compat.css');
    expect(css).toContain("[role='progressbar']");
    expect(css).toContain('.from-slate-950.via-indigo-600.to-sky-500');
    expect(css).toContain('var(--dp-progress-fill)');
  });
});

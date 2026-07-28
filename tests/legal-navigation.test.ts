import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldBypassSupabaseMiddleware } from '../middleware';

const read = (path: string) => readFileSync(path, 'utf8');

describe('legal page navigation and session preservation', () => {
  it('links Terms and Privacy from the global footer', () => {
    const footer = read('components/site-footer.tsx');

    expect(footer).toContain('href="/changelog"');
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/terms"');
  });

  it('keeps public legal pages out of Supabase session validation', () => {
    expect(shouldBypassSupabaseMiddleware('/privacy')).toBe(true);
    expect(shouldBypassSupabaseMiddleware('/terms')).toBe(true);
  });

  it('provides a direct route back to the library from both legal pages', () => {
    for (const path of ['app/privacy/page.tsx', 'app/terms/page.tsx']) {
      const page = read(path);

      expect(page).toContain('href="/library"');
      expect(page).toContain('Open library');
      expect(page).not.toContain('href="/auth/login"');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  });
}

describe('frontend secret boundary', () => {
  it('keeps Supabase clients and environment configuration out of client modules', () => {
    const clientFiles = [...sourceFiles('app'), ...sourceFiles('components')]
      .map((path) => ({ path, content: readFileSync(path, 'utf8') }))
      .filter(({ content }) => /^['"]use client['"];?/m.test(content));

    for (const { path, content } of clientFiles) {
      expect(content, path).not.toContain('@supabase/');
      expect(content, path).not.toContain('@/lib/supabase');
      expect(content, path).not.toContain('process.env');
      expect(content, path).not.toContain('NEXT_PUBLIC_SUPABASE');
      expect(content, path).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    }
  });

  it('has no browser Supabase client entrypoint or hard-coded project key', () => {
    expect(existsSync('lib/supabase/client.ts')).toBe(false);
    expect(existsSync('lib/supabase-browser.ts')).toBe(false);
    expect(readFileSync('Dockerfile', 'utf8')).not.toMatch(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    );
  });
});

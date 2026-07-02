import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Resource Workspace V2 hardening', () => {
  it('keeps approval gate absent by redirecting awaiting approval to library', () => {
    expect(read('app/awaiting-approval/page.tsx')).toContain("redirect('/library')");
  });

  it('protects global search and avoids raw Drive URLs in the payload', () => {
    const route = read('app/api/search/route.ts');
    expect(route).toContain('requireMember()');
    expect(route).toContain('dp_resource_index');
    expect(route).toContain('drive_url:undefined');
    expect(route).toContain('webViewLink:undefined');
  });

  it('protects preview content with membership and root-boundary checks', () => {
    const route = read('app/api/resource/[fileId]/content/route.ts');
    expect(route).toContain('requireMember()');
    expect(route).toContain('assertInsideRoot(fileId)');
    expect(route).not.toContain('webViewLink');
  });

  it('enforces favorite owner isolation and report/ticket RLS in migration', () => {
    const migration = read('supabase/migrations/20260701123000_resource_workspace_v2.sql');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('auth.uid() = reporter_id');
    expect(migration).toContain('role = \'admin\'');
  });

  it('keeps folder navigation link based and avoids obsolete phrasing', () => {
    const browser = read('app/library/library-browser.tsx');
    expect(browser).toContain('<Link');
    expect(browser).toContain('Back to');
    expect(browser).not.toContain('Up one level');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('folder-scoped library search', () => {
  const button = read('components/folder-search-button.tsx');
  const page = read('app/library/page.tsx');
  const browser = read('app/library/library-browser.tsx');
  const search = read('components/global-search.tsx');
  const route = read('app/api/search/route.ts');
  const migration = read(
    'supabase/migrations/20260728153000_folder_scoped_resource_search.sql',
  );

  it('adds a visible search action inside non-root folders', () => {
    expect(page).not.toContain('<FolderSearchButton');
    expect(browser).toContain('crumbs.length > 1 && active');
    expect(browser).toContain('<FolderSearchButton');
    expect(browser).toContain('folderSearch');
    expect(button).toContain("new CustomEvent('dp:open-folder-search'");
    expect(button).toContain('Search this folder');
  });

  it('opens the shared search dialog with the current folder scope', () => {
    expect(search).toContain("addEventListener('dp:open-folder-search'");
    expect(search).toContain("params.set('folderId', scope.folderId)");
    expect(search).toContain('search this folder and its subfolders');
    expect(search).toContain('Search the whole library instead');
  });

  it('uses a service-role-only recursive folder search RPC', () => {
    expect(route).toContain("url.searchParams.get('folderId')");
    expect(route).toContain("sb.rpc('dp_search_resources_in_folder'");
    expect(route).toContain("`${folderId || 'library'}:${needle.toLowerCase()}`");
    expect(migration).toContain('dp_search_resources_in_folder');
    expect(migration).toContain("scoped_path || ' / '");
    expect(migration).toContain('grant execute on function');
    expect(migration).toContain('to service_role');
  });
});

describe('admin case inspector isolation', () => {
  it('remounts local drafts and messages for every selected case', () => {
    const admin = read('app/admin/admin-console.tsx');
    expect(admin).toContain('key={`${selected.kind}:${selected.item.id}`}');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('resource open performance', () => {
  it('reuses visible Library metadata for subsequent resource opens', () => {
    const indexedResource = read('lib/indexed-resource.ts');
    const indexedFolder = read('lib/indexed-folder-view.ts');

    expect(indexedResource).toContain('const hotShells = new Map');
    expect(indexedResource).toContain('primeIndexedResourceShellRows');
    expect(indexedResource).toContain('primeIndexedResourceShellItems');
    expect(indexedResource).toContain("['indexed-resource-core-v3']");
    expect(indexedResource).toContain("['indexed-resource-shell-v3']");
    expect(indexedFolder).toContain(
      'primeIndexedResourceShellRows(allRows, attribution, indexRevision)',
    );
    expect(indexedFolder).toContain('primeIndexedResourceShellItems(');
    expect(indexedFolder).toContain("['indexed-folder-window-v3']");
  });

  it('binds all hot/cached resource authorization to a fresh completed index revision', () => {
    const indexedResource = read('lib/indexed-resource.ts');
    const indexedFolder = read('lib/indexed-folder-view.ts');

    expect(indexedResource).toContain('getResourceIndexSnapshot');
    expect(indexedResource).toContain(".select('status,completed_at,folder_queue')");
    expect(indexedResource).not.toContain('indexed-resource-ready-v1');
    expect(indexedResource).toContain('hit.revision !== revision');
    expect(indexedResource).toContain('readHot(fileId, snapshot.revision)');
    expect(indexedResource).toContain(
      'getIndexedResourceCoreCached(fileId, snapshot.revision)',
    );
    expect(indexedResource).toContain(
      'getIndexedResourceShellCached(fileId, snapshot.revision)',
    );
    expect(indexedFolder).toContain('getResourceIndexSnapshot()');
    expect(indexedFolder).toContain(
      'getIndexedFolderWindowCached(folderId, snapshot.revision)',
    );
  });

  it('does not wait on Google Drive breadcrumbs or favourite state before starting the resource page', () => {
    const page = read('app/resource/[fileId]/page.tsx');

    expect(page).not.toContain('breadcrumbsToRoot');
    expect(page).toContain('getIndexedResourceShell(fileId)');
    expect(page).toContain('indexedFolderNames(indexedMeta?.path, meta.name)');
    expect(page).toContain('<Suspense fallback={<ResourceActionsFallback />}');
    expect(page).toContain('getFavoriteIdSet(userId,[fileId])');
    expect(page.indexOf('getIndexedResourceShell(fileId)')).toBeGreaterThan(
      page.indexOf('Promise.all(['),
    );
  });

  it('uses the light indexed core for preview authorization and parallelizes validation', () => {
    const content = read('app/api/resource/[fileId]/content/route.ts');
    const pdfSession = read('app/api/resource/[fileId]/pdf-session/route.ts');

    for (const source of [content, pdfSession]) {
      expect(source).toContain('getIndexedResourceCore');
      expect(source).toContain('Promise.all([');
      expect(source).not.toContain('getIndexedResourceShell');
    }
  });

  it('shows an immediate generic transition shell without exposing prior-user resource metadata', () => {
    const loading = read('app/resource/[fileId]/loading.tsx');

    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('Opening resource');
    expect(loading).not.toContain('localStorage');
    expect(loading).not.toContain('dp_recent');
    expect(loading).not.toContain('ResourceLoadingIdentity');
  });
});

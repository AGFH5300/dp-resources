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
    expect(indexedResource).toContain("['indexed-resource-core-v2']");
    expect(indexedResource).toContain("['indexed-resource-shell-v2']");
    expect(indexedFolder).toContain('primeIndexedResourceShellRows(allRows, attribution)');
    expect(indexedFolder).toContain('primeIndexedResourceShellItems([');
    expect(indexedFolder).toContain("['indexed-folder-window-v2']");
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

  it('shows an immediate resource-specific transition shell', () => {
    const loading = read('app/resource/[fileId]/loading.tsx');
    const identity = read('app/resource/[fileId]/resource-loading-identity.tsx');

    expect(loading).toContain('<ResourceLoadingIdentity />');
    expect(loading).toContain('aria-busy="true"');
    expect(identity).toContain("localStorage.getItem('dp_recent')");
    expect(identity).toContain('Opening resource');
  });
});

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const route = readFileSync(
  'app/api/resource/[fileId]/pdf-preview/search/route.ts',
  'utf8',
);
const worker = readFileSync('scripts/pdf-preview-worker-r2.mjs', 'utf8');
const backfill = readFileSync('scripts/backfill-pdf-search-manifests.mjs', 'utf8');

describe('PDF search object-storage migration bridge', () => {
  it('uses R2 first, private Supabase Storage second, and Postgres last', () => {
    expect(route).toContain('pdf-preview-search/${session.previewId}.json');
    expect(route).toContain("source: 'r2-manifest' | 'supabase-storage-manifest'");
    expect(route).toContain("'r2-manifest',");
    expect(route).toContain("'supabase-storage-manifest',");
    expect(route).toContain("'x-pdf-search-source': source");
    expect(route).toContain("sb.rpc('dp_search_pdf_preview'");
    expect(route).toContain("'x-pdf-search-source': 'postgres-fallback'");
  });

  it('does not change page-specific exact geometry lookup', () => {
    expect(route).toContain(
      '`${storagePrefix}/search/page-${pageNumber}.json`',
    );
    expect(route).toContain('validatePdfSearchGeometry');
    expect(route).toContain('findPdfSearchMatches');
  });

  it('skips the DB text write only after both private copies verify', () => {
    expect(worker).toContain(
      "const storeTextRpcPath = '/rest/v1/rpc/dp_store_pdf_preview_text';",
    );
    expect(worker).toContain('pdf-preview-search/${documentId}.json');
    expect(worker).toContain('putPrivateR2Object');
    expect(worker).toContain('putSupabasePrivateObject');
    expect(worker).toContain('PDF search manifest verification hash mismatch');
    expect(worker).toContain('pdf_preview_search_manifest_dual_mirrored');
    expect(worker).toContain('JSON.stringify(mirrored.pageCount)');
  });

  it('preserves the historical Postgres write when dual mirroring fails', () => {
    expect(worker).toContain('pdf_preview_search_manifest_mirror_failed');
    expect(worker).toContain('return nativeFetch(input, init);');
  });

  it('backfills and verifies both private storage copies', () => {
    expect(backfill).toContain("const r2Bucket = required('R2_PDF_PREVIEW_BUCKET');");
    expect(backfill).toContain('PDF_SEARCH_MANIFEST_FALLBACK_BUCKET');
    expect(backfill).toContain('existingR2Manifest');
    expect(backfill).toContain('existingFallbackManifest');
    expect(backfill).toContain('putFallbackManifest');
    expect(backfill).toContain('Dual manifest verification failed');
  });

  it('requires an explicit production confirmation before a backfill can write', () => {
    expect(backfill).toContain(
      'if (options.write && !options.confirmProduction)',
    );
    expect(backfill).toContain(
      "throw new Error('--write requires --confirm-production')",
    );
    expect(backfill).toContain(
      "mode: options.write ? 'write-and-verify' : 'dry-run'",
    );
  });

  it('does not mutate either PDF database table during the manifest backfill', () => {
    for (const table of ['dp_pdf_preview_documents', 'dp_pdf_preview_pages']) {
      const tableMutation = new RegExp(
        String.raw`\.from\('${table}'\)[\s\S]{0,400}\.(?:delete|update|upsert|insert)\s*\(`,
      );
      expect(backfill).not.toMatch(tableMutation);
    }
  });
});

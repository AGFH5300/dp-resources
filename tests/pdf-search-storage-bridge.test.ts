import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const route = readFileSync(
  'app/api/resource/[fileId]/pdf-preview/search/route.ts',
  'utf8',
);
const worker = readFileSync('scripts/pdf-preview-worker-r2.mjs', 'utf8');
const backfill = readFileSync('scripts/backfill-pdf-search-manifests.mjs', 'utf8');

describe('PDF search object-storage migration bridge', () => {
  it('prefers the private R2 manifest while preserving the Postgres fallback', () => {
    expect(route).toContain('pdf-preview-search/${session.previewId}.json');
    expect(route).toContain("'x-pdf-search-source': 'r2-manifest'");
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

  it('mirrors R2 search text without replacing the existing DB write', () => {
    expect(worker).toContain("const storeTextRpcPath = '/rest/v1/rpc/dp_store_pdf_preview_text';");
    expect(worker).toContain('pdf-preview-search/${documentId}.json');
    expect(worker).toContain('pdf_preview_search_manifest_mirror_failed');
    expect(worker).toContain('return nativeFetch(input, init);');
  });

  it('requires an explicit production confirmation before a backfill can write', () => {
    expect(backfill).toContain("if (options.write && !options.confirmProduction)");
    expect(backfill).toContain("throw new Error('--write requires --confirm-production')");
    expect(backfill).toContain("mode: options.write ? 'write-and-verify' : 'dry-run'");
  });

  it('does not delete or update database rows during the manifest backfill', () => {
    expect(backfill).not.toMatch(/\.delete\s*\(/);
    expect(backfill).not.toMatch(/\.update\s*\(/);
    expect(backfill).not.toMatch(/\.upsert\s*\(/);
    expect(backfill).not.toMatch(/\.insert\s*\(/);
  });
});

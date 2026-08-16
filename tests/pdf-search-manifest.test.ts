import { describe, expect, it } from 'vitest';

import {
  searchPdfSearchManifest,
  validatePdfSearchManifest,
} from '../lib/pdf-search-manifest';

describe('PDF search manifest', () => {
  it('validates the compact private-object format', () => {
    expect(
      validatePdfSearchManifest(
        { v: 1, d: 'doc-1', p: [[1, 'alpha beta'], [2, 'gamma delta']] },
        'doc-1',
      ),
    ).toEqual({
      version: 1,
      documentId: 'doc-1',
      pages: [
        { pageNumber: 1, text: 'alpha beta' },
        { pageNumber: 2, text: 'gamma delta' },
      ],
    });
  });

  it('rejects a manifest belonging to another preview document', () => {
    expect(
      validatePdfSearchManifest(
        { v: 1, d: 'doc-2', p: [[1, 'alpha']] },
        'doc-1',
      ),
    ).toBeNull();
  });

  it('rejects duplicate or out-of-order pages', () => {
    expect(
      validatePdfSearchManifest(
        { v: 1, d: 'doc-1', p: [[2, 'two'], [1, 'one']] },
        'doc-1',
      ),
    ).toBeNull();
  });

  it('returns page-number ordered snippets with the historical 100-result cap', () => {
    const payload = {
      v: 1,
      d: 'doc-1',
      p: Array.from({ length: 120 }, (_, index) => [
        index + 1,
        `page ${index + 1} prefix searchable phrase suffix`,
      ]),
    };
    const manifest = validatePdfSearchManifest(payload, 'doc-1');
    expect(manifest).not.toBeNull();
    const results = searchPdfSearchManifest(
      manifest!,
      'searchable phrase',
      5000,
    );
    expect(results).toHaveLength(100);
    expect(results[0]?.pageNumber).toBe(1);
    expect(results[99]?.pageNumber).toBe(100);
    expect(results[0]?.snippet).toContain('searchable phrase');
  });
});

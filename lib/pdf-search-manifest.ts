export type PdfSearchManifestPage = {
  pageNumber: number;
  text: string;
};

export type PdfSearchManifest = {
  version: 1;
  documentId: string;
  pages: PdfSearchManifestPage[];
};

const MAX_MANIFEST_PAGES = 10_000;
const MAX_PAGE_TEXT = 200_000;
const MAX_SEARCH_RESULTS = 100;

export function validatePdfSearchManifest(
  value: unknown,
  expectedDocumentId: string,
): PdfSearchManifest | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    v?: unknown;
    d?: unknown;
    p?: unknown;
  };
  if (candidate.v !== 1 || candidate.d !== expectedDocumentId) return null;
  if (!Array.isArray(candidate.p) || candidate.p.length > MAX_MANIFEST_PAGES)
    return null;

  const pages: PdfSearchManifestPage[] = [];
  let previousPage = 0;
  for (const entry of candidate.p) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const pageNumber = Number(entry[0]);
    const text = entry[1];
    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber <= previousPage ||
      typeof text !== 'string' ||
      text.length > MAX_PAGE_TEXT
    )
      return null;
    pages.push({ pageNumber, text });
    previousPage = pageNumber;
  }

  return { version: 1, documentId: expectedDocumentId, pages };
}

export function searchPdfSearchManifest(
  manifest: PdfSearchManifest,
  normalizedQuery: string,
  requestedLimit = MAX_SEARCH_RESULTS,
) {
  const query = normalizedQuery.trim().toLocaleLowerCase();
  if (query.length < 2) return [];
  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 0, 1),
    MAX_SEARCH_RESULTS,
  );
  const results: Array<{ pageNumber: number; snippet: string }> = [];

  for (const page of manifest.pages) {
    const searchText = page.text.toLocaleLowerCase();
    const matchAt = searchText.indexOf(query);
    if (matchAt < 0) continue;
    const start = Math.max(matchAt - 90, 0);
    const snippet = page.text
      .slice(start, start + query.length + 220)
      .replace(/\s+/g, ' ')
      .trim();
    results.push({ pageNumber: page.pageNumber, snippet });
    if (results.length >= limit) break;
  }

  return results;
}

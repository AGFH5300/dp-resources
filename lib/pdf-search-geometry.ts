export type PdfSearchGeometryWord = [string, number, number, number, number, number];
export type PdfSearchGeometryPayload = { v: number; p: number; w: PdfSearchGeometryWord[] };
export type PdfSearchRect = { x: number; y: number; width: number; height: number };
export type PdfSearchMatch = { rects: PdfSearchRect[] };

type Segment = { start: number; end: number; word: PdfSearchGeometryWord };
type RectWithLine = PdfSearchRect & { line: number };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function normalizePdfSearchText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validatePdfSearchGeometry(value: unknown, pageNumber: number): PdfSearchGeometryPayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PdfSearchGeometryPayload>;
  if (candidate.v !== 1 || candidate.p !== pageNumber || !Array.isArray(candidate.w)) return null;
  const words = candidate.w.filter((word): word is PdfSearchGeometryWord => Array.isArray(word)
    && word.length === 6
    && typeof word[0] === 'string'
    && word.slice(1).every((part) => typeof part === 'number' && Number.isFinite(part)));
  return words.length === candidate.w.length ? { v: 1, p: pageNumber, w: words } : null;
}

function mergeMatchedWords(words: PdfSearchGeometryWord[]): PdfSearchRect[] {
  const rects: RectWithLine[] = [];
  for (const word of words) {
    const [, x, y, width, height, line] = word;
    const previous = rects[rects.length - 1];
    const right = x + width;
    if (previous && previous.line === line && x - (previous.x + previous.width) <= 0.018) {
      const top = Math.min(previous.y, y);
      const bottom = Math.max(previous.y + previous.height, y + height);
      previous.width = clamp(Math.max(previous.x + previous.width, right) - previous.x, 0, 1 - previous.x);
      previous.y = top;
      previous.height = clamp(bottom - top, 0.003, 1 - top);
    } else {
      const left = clamp(x - 0.002);
      const top = clamp(y - 0.0015);
      rects.push({
        x: left,
        y: top,
        width: clamp(width + 0.004, 0.002, 1 - left),
        height: clamp(height + 0.003, 0.003, 1 - top),
        line,
      });
    }
  }
  return rects.map(({ x, y, width, height }) => ({ x, y, width, height }));
}

export function findPdfSearchMatches(payload: PdfSearchGeometryPayload, query: string): PdfSearchMatch[] {
  const normalizedQuery = normalizePdfSearchText(query);
  if (!normalizedQuery) return [];

  let pageText = '';
  const segments: Segment[] = [];
  for (const word of payload.w) {
    const token = normalizePdfSearchText(word[0]);
    if (!token) continue;
    if (pageText) pageText += ' ';
    const start = pageText.length;
    pageText += token;
    segments.push({ start, end: pageText.length, word });
  }

  const matches: PdfSearchMatch[] = [];
  let from = 0;
  while (from <= pageText.length - normalizedQuery.length) {
    const index = pageText.indexOf(normalizedQuery, from);
    if (index < 0) break;
    const end = index + normalizedQuery.length;
    const words = segments
      .filter((segment) => segment.end > index && segment.start < end)
      .map((segment) => segment.word);
    if (words.length) matches.push({ rects: mergeMatchedWords(words) });
    from = index + Math.max(1, normalizedQuery.length);
  }
  return matches;
}

import { describe, expect, it } from 'vitest';
import {
  findPdfSearchMatches,
  normalizePdfSearchText,
  validatePdfSearchGeometry,
  type PdfSearchGeometryPayload,
} from '../lib/pdf-search-geometry';

const page = (
  words: PdfSearchGeometryPayload['w'],
): PdfSearchGeometryPayload => ({
  v: 1,
  p: 12,
  w: words,
});

describe('PDF exact search geometry', () => {
  it('validates the expected compact private geometry payload', () => {
    const valid = page([['triangle', 0.1, 0.2, 0.08, 0.025, 0]]);
    expect(validatePdfSearchGeometry(valid, 12)).toEqual(valid);
    expect(validatePdfSearchGeometry(valid, 13)).toBeNull();
    expect(
      validatePdfSearchGeometry({ ...valid, w: [['triangle', 0.1]] }, 12),
    ).toBeNull();
    expect(findPdfSearchMatches(page([]), 'triangle')).toEqual([]);
  });

  it('returns every repeated occurrence of a word on the page', () => {
    const matches = findPdfSearchMatches(
      page([
        ['Triangle', 0.1, 0.1, 0.08, 0.025, 0],
        ['and', 0.2, 0.1, 0.04, 0.025, 0],
        ['triangle', 0.3, 0.1, 0.08, 0.025, 0],
      ]),
      'triangle',
    );

    expect(matches).toHaveLength(2);
    expect(matches[0].rects).toHaveLength(1);
    expect(matches[1].rects).toHaveLength(1);
    expect(matches[0].rects[0].x).toBeLessThan(matches[1].rects[0].x);
  });

  it('supports browser-style substring searches inside a word', () => {
    const matches = findPdfSearchMatches(
      page([
        ['triangle', 0.1, 0.15, 0.08, 0.025, 1],
        ['angle', 0.22, 0.15, 0.05, 0.025, 1],
      ]),
      'angle',
    );

    expect(matches).toHaveLength(2);
    expect(matches.every((match) => match.rects.length === 1)).toBe(true);
  });

  it('merges a phrase on one line into one highlight rectangle', () => {
    const matches = findPdfSearchMatches(
      page([
        ['right', 0.1, 0.2, 0.06, 0.025, 3],
        ['triangle', 0.17, 0.2, 0.09, 0.025, 3],
      ]),
      'right triangle',
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].rects).toHaveLength(1);
    expect(matches[0].rects[0].width).toBeGreaterThan(0.15);
  });

  it('uses separate rectangles when a phrase crosses a line boundary', () => {
    const matches = findPdfSearchMatches(
      page([
        ['right', 0.82, 0.2, 0.07, 0.025, 7],
        ['triangle', 0.1, 0.25, 0.09, 0.025, 8],
      ]),
      'right triangle',
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].rects).toHaveLength(2);
    expect(matches[0].rects[0].y).toBeLessThan(matches[0].rects[1].y);
  });

  it('matches case and punctuation the way a user expects', () => {
    expect(normalizePdfSearchText('  RIGHT—Triangle!  ')).toBe(
      'right triangle',
    );
    const matches = findPdfSearchMatches(
      page([
        ['Right,', 0.1, 0.3, 0.06, 0.025, 9],
        ['TRIANGLE!', 0.17, 0.3, 0.1, 0.025, 9],
      ]),
      'right triangle',
    );
    expect(matches).toHaveLength(1);
  });
});

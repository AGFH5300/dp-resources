import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const viewer = readFileSync('app/resource/[fileId]/pdf-viewer.tsx', 'utf8');

describe('PDF exact-search match focus', () => {
  it('scrolls the internal PDF viewport to the highlighted occurrence', () => {
    expect(viewer).toContain('scrollToSearchMatch');
    expect(viewer).toContain('data-pdf-search-match={matchIndex}');
    expect(viewer).toContain('hitRect.top-rootRect.top');
    expect(viewer).toContain(
      'root.scrollTo({top:Math.max(0,target),behavior})',
    );
    expect(viewer).not.toContain('scrollIntoView');
  });

  it('makes the active match stronger and cycles matches within a page', () => {
    expect(viewer).toContain(
      "activeSearchMatchIndex===matchIndex?'bg-orange-300/85",
    );
    expect(viewer).toContain('candidate>=0&&candidate<matches.length');
    expect(viewer).toContain("direction<0?'last':'first'");
  });

  it('focuses the first actual match after a search result page loads', () => {
    expect(viewer).toContain('void focusSearchResult(found[0].pageNumber,q)');
    expect(viewer).toContain('await loadExactMatches(pageNumber,q)');
    expect(viewer).toContain('scrollToSearchMatch(pageNumber,matchIndex)');
  });
});

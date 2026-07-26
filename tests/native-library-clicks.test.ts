import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const browser = readFileSync('app/library/library-browser.tsx', 'utf8');

describe('Library pointer navigation', () => {
  it('opens normal clicks in place and modifier or middle clicks in a new tab', () => {
    expect(browser.match(/event\.metaKey \|\| event\.ctrlKey/g)).toHaveLength(2);
    expect(browser.match(/event\.button !== 1/g)).toHaveLength(2);
    expect(browser).toContain('navigate(item, path);');
    expect(browser).toContain('navigate(item, path, true);');
    expect(browser).toContain('navigate(item, basePath);');
    expect(browser).toContain('navigate(item, basePath, true);');
  });

  it('keeps the DP Resources context menu and three-dot new-tab action', () => {
    expect(browser.match(/onContextMenu=\{\(e\) => \{/g).length).toBeGreaterThanOrEqual(2);
    expect(browser).toContain('Open in new tab');
    expect(browser).toContain("navigate(item, path, true)");
  });

  it('does not open a resource when middle-clicking row controls', () => {
    expect(
      browser.match(/onAuxClick=\{\(e\) => e\.stopPropagation\(\)\}/g),
    ).toHaveLength(3);
  });
});

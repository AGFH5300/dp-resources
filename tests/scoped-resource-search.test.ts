import { describe, expect, it } from 'vitest';
import { matchesScopedResourceQuery } from '@/lib/scoped-resource-search';

const path = 'Library / Group 3 - I&S / Econ / Past Papers / 1999 / May / HL / General';

describe('folder-scoped resource search', () => {
  it('filters paper-number searches instead of only ranking/highlighting them', () => {
    expect(
      matchesScopedResourceQuery(
        { name: '1999 May Economics HL Paper 1 - Question Paper.pdf', path },
        'paper 1',
      ),
    ).toBe(true);
    expect(
      matchesScopedResourceQuery(
        { name: '1999 May Economics HL Paper 2 - Question Paper.pdf', path },
        'paper 1',
      ),
    ).toBe(false);
    expect(
      matchesScopedResourceQuery(
        { name: '1999 May Economics HL Paper 3 - Question Paper.pdf', path },
        'paper 1',
      ),
    ).toBe(false);
  });

  it('keeps subject aliases useful in a scoped search', () => {
    expect(
      matchesScopedResourceQuery(
        { name: '2025 May Economics HL Paper 1 - Question Paper.pdf', path },
        'econ paper 1',
      ),
    ).toBe(true);
  });

  it('treats numeric query tokens as exact tokens', () => {
    expect(
      matchesScopedResourceQuery(
        { name: 'Economics Paper 10.pdf', path: 'Library / 2026' },
        'paper 1',
      ),
    ).toBe(false);
  });
});

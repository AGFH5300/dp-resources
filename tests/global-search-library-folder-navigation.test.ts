import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('global search Library folder navigation', () => {
  it('remounts the instant Library browser when the folder query changes', () => {
    const page = read('app/library/page.tsx');
    expect(page).toContain('<InstantLibraryBrowser');
    expect(page).toContain('key={folder}');
  });

  it('clears the search transition state for same-path Library folder results', () => {
    const search = read('components/global-search.tsx');
    expect(search).toContain(
      "const sameLibraryPath = r.is_folder && pathname === '/library';",
    );
    expect(search).toContain('if (sameLibraryPath) resetSearch();');
    expect(search).toContain('router.push(href);');
  });
});

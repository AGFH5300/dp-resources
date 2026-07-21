import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldBypassSupabaseMiddleware } from '../middleware';

const read = (path: string) => readFileSync(path, 'utf8');

describe('public changelog page', () => {
  it('renders a plain dated changelog rather than exposing a GitHub activity feed', () => {
    expect(existsSync('app/changelog/page.tsx')).toBe(true);
    expect(existsSync('app/changelog/changelog-list.tsx')).toBe(true);

    const page = read('app/changelog/page.tsx');
    const list = read('app/changelog/changelog-list.tsx');

    expect(page).toContain("path: '/changelog'");
    expect(page).toContain('getChangelog()');
    expect(page).toContain('A plain-language record');
    expect(list).toContain("month: 'long'");
    expect(list).toContain("day: 'numeric'");
    expect(list).toContain('group.entries.map');
    expect(list).toContain('entry.summary');
    expect(list).not.toContain("'use client'");
    expect(list).not.toContain('View commit');
    expect(list).not.toContain('pullRequest');
    expect(list).not.toContain('categoryStyles');
    expect(list).not.toContain('type="search"');
  });

  it('uses merged main-branch history and consolidates it into daily release notes', () => {
    const source = read('lib/changelog.ts');

    expect(source).toContain('/commits?sha=main');
    expect(source).toContain('Merge pull request #');
    expect(source).toContain('historicalSummaries');
    expect(source).toContain('consolidateHistory');
    expect(source).toContain('sentenceFromTitle');
    expect(source).toContain('isUserFacingTitle');
    expect(source).toContain('next: { revalidate: REVALIDATE_SECONDS }');
    expect(source).not.toContain('GITHUB_TOKEN');
  });

  it('keeps visible release notes focused on improvements users experience', () => {
    const source = read('lib/changelog.ts');
    const summaries = source.slice(
      source.indexOf('const historicalSummaries'),
      source.indexOf('function sentenceFromTitle'),
    );

    for (const internalTerm of [
      'administrator',
      'production-ready',
      'Supabase',
      'Cloudflare R2',
      'Docker',
      'deployment',
      'audit records',
      'operations console',
    ]) {
      expect(summaries).not.toContain(internalTerm);
    }
    expect(summaries).toContain("'2026-07-21'");
    expect(summaries).toContain('Added password recovery with secure reset emails');
    expect(summaries).toContain(
      'Suspended accounts now open a dedicated page',
    );
    expect(summaries).toContain(
      'Added notification badges for new support tickets and resource reports',
    );
    expect(summaries).toContain(
      'Fixed password-reset links so they reliably return to the public DP Resources website.',
    );
    expect(summaries).toContain("'2026-07-18'");
    expect(summaries).toContain(
      'Fixed dropdown menus so selected and highlighted options remain clear and readable in dark mode.',
    );
    expect(summaries).toContain('Softened dark-mode borders');
    expect(summaries).toContain('matching search-term highlights');
    expect(summaries).toContain('Made Recent resources consistent');
    expect(summaries).toContain("'2026-07-17'");
    expect(summaries).toContain(
      'Added Light, Dark, and System appearance options',
    );
    expect(summaries).toContain(
      'Improved PDF and presentation loading screens',
    );
    expect(summaries).toContain('Refined global search hover states');
    expect(summaries).toContain("'2026-07-15'");
    expect(summaries).toContain(
      'Expanded instant PDF loading to every large PDF currently available in the Library.',
    );
    expect(summaries).toContain(
      'Fixed regular PDFs so smaller documents continue to open reliably in the standard reader.',
    );
    expect(summaries).toContain(
      'Very long books with more than 1,000 pages now load completely and support direct page jumps.',
    );
    expect(summaries).toContain(
      'PDF search now highlights exact words and phrases',
    );
    expect(summaries).toContain(
      'Made PowerPoint previews safer and more reliable',
    );
    expect(summaries).toContain('Added support conversations');
  });

  it('is linked from the footer, indexed publicly, and bypasses session middleware', () => {
    expect(read('components/site-footer.tsx')).toContain('href="/changelog"');
    expect(read('app/sitemap.ts')).toContain("absoluteUrl('/changelog')");
    expect(shouldBypassSupabaseMiddleware('/changelog')).toBe(true);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

function collectTsxFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) files.push(...collectTsxFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.tsx')) files.push(path);
  }
  return files;
}

const PUBLIC_COPY_FILES = [
  ...collectTsxFiles('app'),
  ...collectTsxFiles('components'),
  'lib/whats-new.ts',
  'lib/changelog.ts',
].filter(
  (file) =>
    !file.startsWith('app/admin/') &&
    !file.startsWith('app/api/') &&
    !file.startsWith('components/admin/'),
);

const INTERNAL_PHRASES = [
  'private asset pipeline',
  'provider hotlinks',
  'third-party images',
  'verified compressed copies',
  'image references internalized',
  'asset-integrity audit',
  'authorized archive',
  'production database',
  'hydrated from the server',
  'source/provider badge',
  'providers to restrict',
  'canonical rows',
  'variant-source provenance',
  'production import audit',
  'source IDs were accepted',
  'same-origin server routes',
  'browser-exposed API-key',
  'client-bundle secret',
  'non-root production runtime',
  'provider and syllabus prefixes',
  'verified archive evidence',
  'source occurrence',
  'private diagrams',
  'private solution-video links',
  'production dependencies',
  'security audit findings',
  'protected assets render',
  'protected diagrams and audio',
  'content-reference diagrams',
  'browser caches',
  'audited every question bank variant',
  'source occurrences',
  'question variants by source',
  'variants remain live',
  'course/question variants',
  'google drive has not been configured',
  'this deployment',
  'provider credentials',
  'sign-in is not configured',
  'shared practice configuration',
  'permanent shared configuration',
  'deployment safeguards',
  'ready variants',
  'live variants',
  'unique variants',
  'physics variants',
  'kine­matics variants'.replace('­', ''),
  'supporting assets',
  'raw asset references',
  'legacy mathematics archive',
  'authenticated listening audio',
  'images are optimized',
  'reconciled 2,880 imported image references',
  'imported image references',
  'verified optimized copies',
  'private storage pipeline',
  'third-party source websites',
  'meaningfully smaller',
  'source diagrams could not be recovered',
  'source references that could not be recovered',
  'withheld instead of loading',
  'image references staged for reconciliation',
  'upstream object',
  'question-source rows',
  'variant-source rows',
  'quarantined variants',
  'render status',
] as const;

describe('public copy hygiene', () => {
  it('keeps technical release summaries out of the public changelog', async () => {
    const { isPublicChangelogEntry } = await import('../lib/public-changelog');
    const blocked = [
      'DP Resources reconciled 2,880 imported image references into its private asset pipeline.',
      'Verified optimized copies are served from a private storage pipeline.',
      'Questions with unrecovered source references were quarantined.',
    ];

    for (const summary of blocked) {
      expect(
        isPublicChangelogEntry({
          id: 'test-release',
          summary,
          date: '2026-09-19T00:00:00.000Z',
        }),
      ).toBe(false);
    }

    expect(
      isPublicChangelogEntry({
        id: 'release-private-question-bank-assets',
        summary: 'Improved Question Bank diagrams so they load faster and more reliably.',
        date: '2026-09-19T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('keeps implementation and migration language out of student-facing surfaces', () => {
    for (const file of PUBLIC_COPY_FILES) {
      const source = read(file).toLowerCase();
      for (const phrase of INTERNAL_PHRASES) {
        expect(source, `${file} should not expose "${phrase}"`).not.toContain(
          phrase.toLowerCase(),
        );
      }
    }
  });

  it('uses plain-language fallbacks for unavailable Question Bank visuals', () => {
    const renderer = read('components/question-bank/question-content.tsx');
    expect(renderer).toContain('This image is currently unavailable.');
    expect(renderer).not.toContain('authorized archive');
    expect(renderer).not.toContain('source occurrence');
    expect(renderer).toContain('This question is currently unavailable.');
    expect(renderer).toContain('This markscheme is currently unavailable.');
  });
});

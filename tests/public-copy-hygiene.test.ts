import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const PUBLIC_COPY_FILES = [
  'lib/whats-new.ts',
  'components/whats-new/whats-new-media.tsx',
  'app/changelog/page.tsx',
  'lib/changelog.ts',
  'components/question-bank/question-content.tsx',
  'components/question-bank/local-practice-session-page.tsx',
  'components/content-source-badge.tsx',
  'app/settings/settings-centre.tsx',
  'components/tutorial/tutorial-controller.tsx',
] as const;

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
] as const;

describe('public copy hygiene', () => {
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

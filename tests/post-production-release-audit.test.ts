import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('16 September post-production release audit', () => {
  it('pins the production baseline and RevisionDojo expansion in release surfaces', () => {
    const audit = read('docs/POST_PRODUCTION_RELEASE_AUDIT_2026-09-16.md');
    const whatsNew = read('lib/whats-new.ts');
    const changelog = read('app/changelog/page.tsx');
    const fallback = read('lib/changelog.ts');

    expect(audit).toContain('400999180c4f89f6aaa4f9178af9a465b022dded');
    for (const value of ['11,763', '15,571', '15,645', 'RevisionDojo']) {
      expect(audit).toContain(value);
      expect(changelog).toContain(value);
      expect(fallback).toContain(value);
    }
    expect(whatsNew).toContain('11,763 RevisionDojo questions added');
    expect(whatsNew).toContain('15,571 course/question variants');
    expect(whatsNew).toContain("id: '2026-09-16-revisiondojo-guided-onboarding'");
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('post-production live-data release audit', () => {
  it('keeps Supabase-only Question Bank changes in public release surfaces', () => {
    const whatsNew = read('lib/whats-new.ts');
    const page = read('app/changelog/page.tsx');
    const fallback = read('lib/changelog.ts');
    const audit = read('docs/POST_PRODUCTION_RELEASE_AUDIT_2026-09-16.md');

    for (const text of [
      'Physics A.1–A.5, now with CBS',
      '57,696 questions ready to practise',
      '44 Save My Exams Kinematics questions',
    ]) expect(whatsNew).toContain(text);

    for (const text of [
      '302 ready questions',
      '415 confirmed duplicate Question Bank entries',
      '191 duplicate Question Bank entries',
      '11,763 RevisionDojo questions',
      'broader course coverage',
    ]) {
      expect(page).toContain(text);
      expect(fallback).toContain(text);
    }

    for (const internalText of [
      '341 source occurrences',
      '217 distinct canonical questions',
      '15,645 source links',
      'variant-source provenance',
      'production import audit',
    ]) {
      expect(page).not.toContain(internalText);
      expect(fallback).not.toContain(internalText);
    }

    for (const text of ['42,124 canonical questions', '57,776 variants', '302 ready / 0 quarantined']) {
      expect(audit).toContain(text);
    }
  });
});

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
      '57,696 live question variants',
      '44 new Save My Exams Kinematics variants',
    ]) expect(whatsNew).toContain(text);

    for (const text of [
      '341 source occurrences',
      '217 distinct canonical questions',
      '302 variants are live and ready',
      '415 redundant canonical Question Bank rows',
      '191 redundant canonical rows',
      '12,306 visible questions',
      '11,832 source IDs',
      '11,763 distinct RevisionDojo questions',
      '15,571 course/question variants',
      '15,645 source links',
    ]) {
      expect(page).toContain(text);
      expect(fallback).toContain(text);
    }

    for (const text of ['42,124 canonical questions', '57,776 variants', '302 ready / 0 quarantined']) {
      expect(audit).toContain(text);
    }
  });
});

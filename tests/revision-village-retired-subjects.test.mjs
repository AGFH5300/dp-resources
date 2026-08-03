import { describe, expect, it } from 'vitest';

import { isRetiredRevisionVillageSubjectGroup } from '../scripts/question-bank/revision-village.mjs';

describe('Revision Village retired subjects', () => {
  it('excludes English B while retaining active language subjects', () => {
    expect(isRetiredRevisionVillageSubjectGroup('ib-english-b')).toBe(true);
    expect(isRetiredRevisionVillageSubjectGroup('ib-french-b')).toBe(false);
    expect(isRetiredRevisionVillageSubjectGroup('ib-spanish-b')).toBe(false);
  });
});

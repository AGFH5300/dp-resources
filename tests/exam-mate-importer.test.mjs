import { describe, expect, it } from 'vitest';

import {
  EXAM_MATE_AUDIT_ZIP_SHA256,
  EXAM_MATE_EXPECTED,
  canonicalExamKey,
  courseDescriptor,
} from '../scripts/question-bank/exam-mate.mjs';
import { parseArguments } from '../scripts/import-exam-mate-question-bank.mjs';

describe('Exam-Mate Question Bank importer', () => {
  it('pins the reviewed audit and exact source counts', () => {
    expect(EXAM_MATE_AUDIT_ZIP_SHA256).toBe(
      '0ba6835f8046af116c589a6545af7f02d472e059cdb8488d7eb4fcd4dd65fa4f',
    );
    expect(EXAM_MATE_EXPECTED).toMatchObject({
      sourceQuestions: 14199,
      importableQuestions: 14128,
      quarantinedQuestions: 71,
      importablePhysicalAssets: 31231,
    });
  });

  it('normalizes Exam-Mate and PESTLE references to the same exam key', () => {
    const source = {
      reference: 'BIOLO/30_HL_Winter_2019_Q23',
      referenceParts: {
        sourcePaperCode: '30',
        level: 'HL',
        season: 'Winter',
        year: 2019,
        questionNumber: '23',
      },
    };
    expect(canonicalExamKey('Biology', source)).toBe(
      canonicalExamKey('Biology', '19N.3.HL.TZ0.23'),
    );
  });

  it('keeps old Mathematics tracks separate from AA and AI', () => {
    expect(courseDescriptor('Mathematical Studies', 'SL').course.source_key).toBe(
      'math:mathematical-studies-sl',
    );
    expect(courseDescriptor('Further Mathematics', 'HL').course.source_key).toBe(
      'math:further-mathematics-hl',
    );
  });

  it('requires explicit production and local-asset confirmation', () => {
    expect(() => parseArguments(['--mode', 'database'])).toThrow(
      '--confirm-production',
    );
    expect(() =>
      parseArguments(['--mode', 'assets', '--confirm-production']),
    ).toThrow('--assets-root');
  });
});

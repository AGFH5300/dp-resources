import { describe, expect, it } from 'vitest';

import {
  extractQuestionReferences,
  redactHeaders,
  safeFilename,
  sanitizeTextBody,
  sanitizeUrl,
  stableJson,
} from '../scripts/question-bank/exam-mate-capture.mjs';

describe('Exam-Mate capture safety helpers', () => {
  it('redacts authentication material from headers and URLs', () => {
    expect(
      redactHeaders({ Cookie: 'session=secret', Authorization: 'Bearer secret', Accept: 'text/html' }),
    ).toEqual({ Cookie: '[REDACTED]', Authorization: '[REDACTED]', Accept: 'text/html' });

    expect(sanitizeUrl('https://www.exam-mate.com/path?token=secret&page=2#private')).toBe(
      'https://www.exam-mate.com/path?token=%5BREDACTED%5D&page=2',
    );
  });

  it('redacts sensitive JSON response fields while preserving question content', () => {
    const body = sanitizeTextBody(
      JSON.stringify({ token: 'secret', question: 'Calculate x.', nested: { session_id: 'hidden' } }),
      'application/json',
    );
    expect(JSON.parse(body)).toEqual({
      token: '[REDACTED]',
      question: 'Calculate x.',
      nested: { session_id: '[REDACTED]' },
    });
  });

  it('recognises Exam-Mate IB references and generated QIDs', () => {
    expect(
      extractQuestionReferences(
        'BIOLO/30_HL_Winter_2019_Q23 and exam-mate QID146432 and BIOLO/30_HL_Winter_2019_Q23',
      ),
    ).toEqual(['BIOLO/30_HL_Winter_2019_Q23', 'exam-mate QID146432']);
  });

  it('creates stable JSON and safe file names', () => {
    expect(stableJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "z": 1\n}\n',
    );
    expect(safeFilename('IB Biology / HL: 2025')).toBe('IB-Biology-HL-2025');
  });
});

import { describe, expect, it } from 'vitest';

import {
  collectQuestionRecords,
  compareSourceIds,
  discoverJsonReferences,
  discoverScriptReferences,
  indexQuestionRecord,
  isQuestionLike,
  normalizeAllowedUrl,
  parseArgs,
} from '../scripts/question-bank/capture-village.mjs';

const APP = 'https://village.pirateib.su/';

describe('PirateIB Village metadata/fingerprint indexer', () => {
  it('defaults to the Village app and keeps production comparison opt-in/credential-aware', () => {
    const args = parseArgs(['--output', '/tmp/village-audit', '--no-compare-production']);
    expect(args.appUrl).toBe(APP);
    expect(args.output).toBe('/tmp/village-audit');
    expect(args.compareProduction).toBe(false);
  });

  it('accepts only HTTPS Village/PirateIB hosts', () => {
    expect(normalizeAllowedUrl('/assets/app.js', APP, APP)).toBe('https://village.pirateib.su/assets/app.js');
    expect(normalizeAllowedUrl('https://cdn.pirateib.sh/bank.json', APP, APP)).toBe('https://cdn.pirateib.sh/bank.json');
    expect(normalizeAllowedUrl('https://example.com/bank.json', APP, APP)).toBeNull();
    expect(normalizeAllowedUrl('http://village.pirateib.su/bank.json', APP, APP)).toBeNull();
  });

  it('discovers app scripts and Pestle-style JSON filename maps', () => {
    const html = '<script type="module" src="/assets/app.js"></script>';
    expect(discoverScriptReferences(html, APP, APP)).toEqual(['https://village.pirateib.su/assets/app.js']);

    const source = `
      const bankBase = 'https://village-assets.pirateib.sh/banks/';
      const relativeBankBase = '../banks/';
      const fileNameMap = {
        biology: 'Biology QB.json',
        math: 'Mathematics AA HL.json'
      };
      fetch('direct/ESS.json');
    `;
    const refs = discoverJsonReferences(source, 'https://village.pirateib.su/assets/app.js', APP);
    expect(refs).toContain('https://village-assets.pirateib.sh/banks/Biology%20QB.json');
    expect(refs).toContain('https://village-assets.pirateib.sh/banks/Mathematics%20AA%20HL.json');
    expect(refs).toContain('https://village.pirateib.su/banks/Biology%20QB.json');
    expect(refs).toContain('https://village.pirateib.su/assets/direct/ESS.json');
  });

  it('finds nested question records without treating arbitrary metadata as questions', () => {
    const question = {
      question_id: 'BIO.24M.HL.P1.1',
      subject: 'Biology',
      topics: ['A1.1'],
      Question: '<p>Which structure contains genetic material?</p>',
      Markscheme: '<p>A</p>',
    };
    const payload = {
      generatedAt: '2026-09-10',
      banks: [{ name: 'Biology', records: [question] }],
    };
    expect(isQuestionLike(payload)).toBe(false);
    expect(isQuestionLike(question)).toBe(true);
    expect(collectQuestionRecords(payload)).toEqual([question]);
  });

  it('emits hashes and metadata but never source question/markscheme text', () => {
    const indexed = indexQuestionRecord({
      question_id: 'BIO.24M.HL.P1.1',
      subject: 'Biology',
      level: 'HL',
      topic: 'A1.1',
      subtopic: 'DNA',
      Question: '<p>Which structure contains <strong>genetic material</strong>?</p>',
      Markscheme: '<p>Award [1] for nucleus.</p>',
    }, 'https://village-assets.pirateib.sh/Biology.json');

    expect(indexed.source_question_id).toBe('BIO.24M.HL.P1.1');
    expect(indexed.subject).toBe('Biology');
    expect(indexed.level).toBe('HL');
    expect(indexed.topics).toEqual(['A1.1']);
    expect(indexed.subtopics).toEqual(['DNA']);
    expect(indexed.question_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(indexed.markscheme_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(indexed.combined_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(indexed)).not.toContain('genetic material');
    expect(JSON.stringify(indexed)).not.toContain('Award [1]');
  });

  it('compares Village source IDs with the existing production RV provenance read-only', () => {
    const comparison = compareSourceIds(['A', 'B', 'C'], ['B', 'C', 'D']);
    expect(comparison.village_source_question_ids).toBe(3);
    expect(comparison.production_revision_village_source_question_ids).toBe(3);
    expect(comparison.present_source_question_ids).toEqual(['B', 'C']);
    expect(comparison.new_source_question_ids).toEqual(['A']);
    expect(comparison.production_ids_not_seen).toEqual(['D']);
  });
});

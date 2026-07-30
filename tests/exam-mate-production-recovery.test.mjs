import { afterEach, describe, expect, it } from 'vitest';

import {
  canRetargetExamMatePartialAsset,
  canonicalExamKey,
  normalizeExamMateSearchDocuments,
  normalizedRowUniqueness,
} from '../scripts/question-bank/exam-mate.mjs';
import {
  deduplicateRowsForUpsert,
  parseArguments,
  resolveQuestionBankBucket,
  validateBatchResume,
  verifyR2Head,
} from '../scripts/import-exam-mate-question-bank-optimized.mjs';
import { selectedFileSignature } from '../scripts/verify-exam-mate-staging.mjs';

const ORIGINAL_ENV = {
  questionBank: process.env.R2_QUESTION_BANK_BUCKET,
  preview: process.env.R2_PDF_PREVIEW_BUCKET,
};

afterEach(() => {
  if (ORIGINAL_ENV.questionBank == null)
    delete process.env.R2_QUESTION_BANK_BUCKET;
  else process.env.R2_QUESTION_BANK_BUCKET = ORIGINAL_ENV.questionBank;
  if (ORIGINAL_ENV.preview == null) delete process.env.R2_PDF_PREVIEW_BUCKET;
  else process.env.R2_PDF_PREVIEW_BUCKET = ORIGINAL_ENV.preview;
});

describe('Exam-Mate production recovery', () => {
  it('keeps the reviewed legacy paper parser correction in source', () => {
    const legacyOption = {
      reference: 'MATHE/1 Option A 2_HL_Summer_2018_Q7',
      referenceParts: {
        sourcePaperCode: '1 Option A 2',
        level: 'HL',
        season: 'Summer',
        year: 2018,
        questionNumber: '7',
      },
    };
    const singlePaper = {
      reference: 'MATHE/2_SL_Winter_2017_Q4',
      referenceParts: {
        sourcePaperCode: '2',
        level: 'SL',
        season: 'Winter',
        year: 2017,
        questionNumber: '4',
      },
    };

    expect(canonicalExamKey('Mathematics', legacyOption)).toContain(
      '18|M|1|HL|TZ2|7',
    );
    expect(canonicalExamKey('Mathematics', singlePaper)).toContain(
      '17|N|2|SL|TZ0|4',
    );
  });

  it('normalizes identical duplicate search rows to one deterministic row', () => {
    const result = normalizeExamMateSearchDocuments([
      {
        variant_id: 'variant-1',
        source_question_id: 'source-2',
        material_signature: 'same',
        search_text: 'same text',
      },
      {
        variant_id: 'variant-1',
        source_question_id: 'source-1',
        material_signature: 'same',
        search_text: 'same text',
      },
    ]);

    expect(result.rows).toEqual([
      { variant_id: 'variant-1', search_text: 'same text' },
    ]);
    expect(result.counts).toMatchObject({
      inputRows: 2,
      outputRows: 1,
      duplicateCandidates: 1,
      exactDuplicateCandidates: 1,
      materiallyDivergentGroups: 0,
    });
  });

  it('merges compatible search aliases deterministically', () => {
    const forward = normalizeExamMateSearchDocuments([
      {
        variant_id: 'variant-1',
        source_question_id: 'source-2',
        material_signature: 'same',
        search_text: 'Zulu alias',
      },
      {
        variant_id: 'variant-1',
        source_question_id: 'source-1',
        material_signature: 'same',
        search_text: 'Alpha alias',
      },
    ]);
    const reverse = normalizeExamMateSearchDocuments([
      {
        variant_id: 'variant-1',
        source_question_id: 'source-1',
        material_signature: 'same',
        search_text: 'Alpha alias',
      },
      {
        variant_id: 'variant-1',
        source_question_id: 'source-2',
        material_signature: 'same',
        search_text: 'Zulu alias',
      },
    ]);

    expect(forward.rows).toEqual(reverse.rows);
    expect(forward.rows[0].search_text).toBe('Alpha alias\nZulu alias');
    expect(forward.counts.mergedSearchCandidates).toBe(1);
  });

  it('raises a critical finding for materially different collapsed sources', () => {
    const result = normalizeExamMateSearchDocuments([
      {
        variant_id: 'variant-1',
        source_question_id: 'source-1',
        material_signature: 'payload-a',
        search_text: 'text a',
      },
      {
        variant_id: 'variant-1',
        source_question_id: 'source-2',
        material_signature: 'payload-b',
        search_text: 'text b',
      },
    ]);

    expect(result.counts.materiallyDivergentGroups).toBe(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: 'critical',
        code: 'exam_mate_variant_sources_materially_diverge',
      }),
    );
  });

  it('asserts every required normalized conflict key is unique', () => {
    const result = normalizedRowUniqueness({
      searchDocuments: [
        { variant_id: 'variant-1' },
        { variant_id: 'variant-1' },
      ],
      variants: [],
      questionSources: [],
      variantSources: [],
      variantAssets: [],
      placements: [],
      variantPapers: [],
    });

    expect(result.counts.searchDocuments.duplicateKeys).toBe(1);
    expect(result.findings[0]).toMatchObject({
      severity: 'critical',
      code: 'exam_mate_normalized_row_key_collision',
    });
  });

  it('defensively removes duplicate Postgres conflict keys before chunking', () => {
    const input = [
      { variant_id: 'variant-1', search_text: 'Zulu alias' },
      { variant_id: 'variant-1', search_text: 'Alpha alias' },
    ];
    const first = deduplicateRowsForUpsert(
      'dp_qb_question_search',
      input,
      'variant_id',
      true,
    );
    const resumed = deduplicateRowsForUpsert(
      'dp_qb_question_search',
      first.rows,
      'variant_id',
      true,
    );

    expect(first.rows).toEqual([
      {
        variant_id: 'variant-1',
        search_text: 'Alpha alias\nZulu alias',
      },
    ]);
    expect(first.stats.duplicateRowsRemoved).toBe(1);
    expect(resumed.rows).toEqual(first.rows);
    expect(resumed.stats.duplicateRowsRemoved).toBe(0);
  });

  it('refuses incompatible duplicates for append and update tables', () => {
    expect(() =>
      deduplicateRowsForUpsert(
        'dp_qb_variant_sources',
        [
          { id: 'same', variant_id: 'variant-a' },
          { id: 'same', variant_id: 'variant-b' },
        ],
        'id',
        false,
      ),
    ).toThrow('incompatible rows');

    expect(() =>
      deduplicateRowsForUpsert(
        'dp_qb_assets',
        [
          { id: 'same', storage_bucket: 'bucket-a' },
          { id: 'same', storage_bucket: 'bucket-b' },
        ],
        'id',
        true,
      ),
    ).toThrow('incompatible rows');
  });

  it('requires the exact failed batch identity for a production resume', () => {
    expect(
      parseArguments([
        '--mode',
        'all',
        '--assets-root',
        '/tmp/assets',
        '--confirm-production',
        '--resume-batch-id',
        '27462015-2a25-41bf-93b0-c4efd24d9a3a',
      ]).resumeBatchId,
    ).toBe('27462015-2a25-41bf-93b0-c4efd24d9a3a');
    expect(() =>
      parseArguments([
        '--mode',
        'database',
        '--confirm-production',
        '--resume-batch-id',
        'not-a-uuid',
      ]),
    ).toThrow('--resume-batch-id must be a UUID');
  });

  it('resumes the same failed archive batch but refuses concurrent ownership', () => {
    const batch = {
      id: '27462015-2a25-41bf-93b0-c4efd24d9a3a',
      status: 'failed',
    };
    expect(
      validateBatchResume(
        batch,
        '27462015-2a25-41bf-93b0-c4efd24d9a3a',
        'all',
      ),
    ).toBe(batch.id);
    expect(() =>
      validateBatchResume({ ...batch, status: 'importing' }, batch.id, 'all'),
    ).toThrow('already marked importing');
    expect(() =>
      validateBatchResume({ ...batch, status: 'completed' }, batch.id, 'all'),
    ).toThrow('already completed');
    expect(() =>
      validateBatchResume(batch, null, 'all'),
    ).toThrow('requires --resume-batch-id');
  });

  it('fails closed without a dedicated Question Bank bucket', () => {
    delete process.env.R2_QUESTION_BANK_BUCKET;
    delete process.env.R2_PDF_PREVIEW_BUCKET;
    expect(() => resolveQuestionBankBucket()).toThrow(
      'R2_QUESTION_BANK_BUCKET is required',
    );

    process.env.R2_QUESTION_BANK_BUCKET = 'dp-pdf-previews';
    expect(() => resolveQuestionBankBucket()).toThrow('dedicated bucket');

    process.env.R2_QUESTION_BANK_BUCKET = 'dp-question-bank';
    process.env.R2_PDF_PREVIEW_BUCKET = 'dp-pdf-previews';
    expect(resolveQuestionBankBucket()).toBe('dp-question-bank');
  });

  it('retargets only unverified assets created by the exact failed batch', () => {
    const batchId = '27462015-2a25-41bf-93b0-c4efd24d9a3a';
    const asset = {
      id: 'asset-1',
      created_by_batch_id: batchId,
      upload_status: 'pending',
      verification_status: 'pending',
    };
    const examMateAssetIds = new Set(['asset-1']);

    expect(
      canRetargetExamMatePartialAsset(asset, examMateAssetIds, batchId),
    ).toBe(true);
    expect(
      canRetargetExamMatePartialAsset(
        { ...asset, created_by_batch_id: 'unrelated-batch' },
        examMateAssetIds,
        batchId,
      ),
    ).toBe(false);
    expect(
      canRetargetExamMatePartialAsset(
        { ...asset, verification_status: 'verified' },
        examMateAssetIds,
        batchId,
      ),
    ).toBe(false);
    expect(
      canRetargetExamMatePartialAsset(asset, new Set(), batchId),
    ).toBe(false);
  });

  it('requires size, MIME type, and SHA-256 metadata in R2 HEAD checks', () => {
    const asset = {
      byte_size: 123,
      content_type: 'image/webp',
      content_hash: 'a'.repeat(64),
    };
    const valid = new Response(null, {
      status: 200,
      headers: {
        'content-length': '123',
        'content-type': 'image/webp',
        'x-amz-meta-sha256': 'a'.repeat(64),
      },
    });
    const missingChecksum = new Response(null, {
      status: 200,
      headers: {
        'content-length': '123',
        'content-type': 'image/webp',
      },
    });

    expect(verifyR2Head(asset, valid)).toBe(true);
    expect(verifyR2Head(asset, missingChecksum)).toBe(false);
  });

  it('recognizes only the pinned PNG and WebP staging signatures', () => {
    expect(
      selectedFileSignature(
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
        'png',
      ),
    ).toBe(true);
    expect(
      selectedFileSignature(Buffer.from('RIFF0000WEBP'), 'webp'),
    ).toBe(true);
    expect(selectedFileSignature(Buffer.from('not-an-image'), 'png')).toBe(
      false,
    );
  });
});

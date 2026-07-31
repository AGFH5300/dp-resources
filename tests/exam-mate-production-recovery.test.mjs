import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canRepairExamMatePartialRow,
  canRetargetExamMatePartialAsset,
  canonicalExamKey,
  fetchAll,
  normalizeExamMateSearchDocuments,
  normalizedRowUniqueness,
  resolveExamMateForProduction,
  strictQuestionSignature,
} from '../scripts/question-bank/exam-mate.mjs';
import {
  applyPartialBatchRecovery,
  deduplicateRowsForUpsert,
  parseArguments,
  readSequentially,
  resolveQuestionBankBucket,
  validateBatchResume,
  verifyR2Head,
} from '../scripts/import-exam-mate-question-bank-optimized.mjs';
import { listPrivateR2Buckets } from '../scripts/r2-s3.mjs';
import { selectedFileSignature } from '../scripts/verify-exam-mate-staging.mjs';

const ORIGINAL_ENV = {
  questionBank: process.env.R2_QUESTION_BANK_BUCKET,
  preview: process.env.R2_PDF_PREVIEW_BUCKET,
  accountId: process.env.R2_ACCOUNT_ID,
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
};
const ORIGINAL_FETCH = globalThis.fetch;

function snapshotClient(tables) {
  return {
    from(table) {
      const rows = tables[table] || [];
      let cursor = null;
      const query = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        gt(_column, value) {
          cursor = value;
          return query;
        },
        async range(start, end) {
          const available =
            cursor === null
              ? rows
              : rows.filter((row) => String(row.id) > String(cursor));
          return { data: available.slice(start, end + 1), error: null };
        },
      };
      return query;
    },
  };
}

function normalizedQuestion(sourceQuestion) {
  return {
    verificationStatus: 'passed',
    findings: [],
    actualCounts: {},
    source: {
      importableQuestions: [sourceQuestion],
      usedAssetUrls: new Set(),
      usedPhysicalHashes: new Set(),
      verifiedAssetByUrl: new Map(),
      assetRoot: '/redacted',
      optimizationAudit: { planRows: [] },
    },
  };
}

afterEach(() => {
  if (ORIGINAL_ENV.questionBank == null)
    delete process.env.R2_QUESTION_BANK_BUCKET;
  else process.env.R2_QUESTION_BANK_BUCKET = ORIGINAL_ENV.questionBank;
  if (ORIGINAL_ENV.preview == null) delete process.env.R2_PDF_PREVIEW_BUCKET;
  else process.env.R2_PDF_PREVIEW_BUCKET = ORIGINAL_ENV.preview;
  if (ORIGINAL_ENV.accountId == null) delete process.env.R2_ACCOUNT_ID;
  else process.env.R2_ACCOUNT_ID = ORIGINAL_ENV.accountId;
  if (ORIGINAL_ENV.endpoint == null) delete process.env.R2_ENDPOINT;
  else process.env.R2_ENDPOINT = ORIGINAL_ENV.endpoint;
  if (ORIGINAL_ENV.accessKeyId == null) delete process.env.R2_ACCESS_KEY_ID;
  else process.env.R2_ACCESS_KEY_ID = ORIGINAL_ENV.accessKeyId;
  if (ORIGINAL_ENV.secretAccessKey == null)
    delete process.env.R2_SECRET_ACCESS_KEY;
  else process.env.R2_SECRET_ACCESS_KEY = ORIGINAL_ENV.secretAccessKey;
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('Exam-Mate production recovery', () => {
  it('retries a timed-out production read with the same deterministic page', async () => {
    const ranges = [];
    const results = [
      {
        data: null,
        error: {
          code: '57014',
          message: 'canceling statement due to statement timeout',
        },
      },
      { data: [{ id: 'row-1' }], error: null },
    ];
    const client = {
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          order: vi.fn(() => query),
          range: vi.fn((start, end) => {
            ranges.push([start, end]);
            return Promise.resolve(results.shift());
          }),
        };
        return query;
      }),
    };
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await expect(
      fetchAll(client, 'dp_qb_question_sources', 'id', ['id'], 0),
    ).resolves.toEqual([{ id: 'row-1' }]);

    expect(ranges).toEqual([
      [0, 999],
      [0, 999],
    ]);
    expect(stderr).toHaveBeenCalledWith(
      'dp_qb_question_sources read page 1 timed out; retrying attempt 2/4.\n',
    );
  });

  it('uses a deterministic keyset after the first single-ID page', async () => {
    const ranges = [];
    const greaterThan = [];
    const pages = [
      {
        data: Array.from({ length: 1000 }, (_, index) => ({
          id: String(index).padStart(4, '0'),
        })),
        error: null,
      },
      { data: [{ id: '1000' }], error: null },
    ];
    const client = {
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          order: vi.fn(() => query),
          gt: vi.fn((column, value) => {
            greaterThan.push([column, value]);
            return query;
          }),
          range: vi.fn((start, end) => {
            ranges.push([start, end]);
            return Promise.resolve(pages.shift());
          }),
        };
        return query;
      }),
    };

    const rows = await fetchAll(client, 'dp_qb_questions', 'id', ['id'], 0);

    expect(rows).toHaveLength(1001);
    expect(ranges).toEqual([
      [0, 999],
      [0, 999],
    ]);
    expect(greaterThan).toEqual([['id', '0999']]);
  });

  it('does not retry a non-timeout PostgreSQL cancellation', async () => {
    const range = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          code: '57014',
          message: 'canceling statement due to user request',
        },
      }),
    );
    const client = {
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          order: vi.fn(() => query),
          range,
        };
        return query;
      }),
    };

    await expect(
      fetchAll(client, 'dp_qb_question_sources', 'id', ['id'], 0),
    ).rejects.toThrow('canceling statement due to user request');
    expect(range).toHaveBeenCalledTimes(1);
  });

  it('serializes production snapshot reads to avoid statement-timeout contention', async () => {
    let activeReads = 0;
    let maximumActiveReads = 0;
    const releases = [];
    const client = {
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          order: vi.fn(() => query),
          range: vi.fn(
            () =>
              new Promise((resolve) => {
                activeReads += 1;
                maximumActiveReads = Math.max(
                  maximumActiveReads,
                  activeReads,
                );
                releases.push(() => {
                  activeReads -= 1;
                  resolve({ data: [], error: null });
                });
              }),
          ),
        };
        return query;
      }),
    };
    const reads = Array.from({ length: 8 }, (_, index) =>
      fetchAll(client, `table_${index}`, 'id', ['id'], 0),
    );

    for (let index = 0; index < reads.length; index += 1) {
      await vi.waitFor(() => expect(releases).toHaveLength(1));
      releases.shift()();
    }
    await Promise.all(reads);

    expect(maximumActiveReads).toBe(1);
  });

  it('serializes terminal verification reads to avoid statement-timeout contention', async () => {
    let activeReads = 0;
    let maximumActiveReads = 0;
    const releases = [];
    const reads = Array.from({ length: 8 }, (_, index) => async () => {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      await new Promise((resolve) => releases.push(resolve));
      activeReads -= 1;
      return index;
    });
    const result = readSequentially(reads);

    for (let index = 0; index < reads.length; index += 1) {
      await vi.waitFor(() => expect(releases).toHaveLength(1));
      releases.shift()();
    }

    await expect(result).resolves.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(maximumActiveReads).toBe(1);
  });

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

    expect(canonicalExamKey('Mathematics', legacyOption)).toBe(
      'mathematics|18|M|1|HL|TZ2|7|OPTa',
    );
    expect(canonicalExamKey('Mathematics', singlePaper)).toContain(
      '17|N|2|SL|TZ0|4',
    );
  });

  it('keeps legacy Mathematics option papers in distinct canonical keys', () => {
    const keys = [
      '3 Calculus0',
      '3 Discrete0',
      '3 Sets0',
      '3 Statistics0',
    ].map((sourcePaperCode) =>
      canonicalExamKey('Mathematics', {
        reference: `redacted-${sourcePaperCode}`,
        referenceParts: {
          sourcePaperCode,
          level: 'HL',
          season: 'Summer',
          year: 2019,
          questionNumber: '1',
        },
      }),
    );

    expect(new Set(keys).size).toBe(4);
    expect(keys).toEqual([
      'mathematics|19|M|3|HL|TZ0|1|OPTcalculus',
      'mathematics|19|M|3|HL|TZ0|1|OPTdiscrete',
      'mathematics|19|M|3|HL|TZ0|1|OPTsets',
      'mathematics|19|M|3|HL|TZ0|1|OPTstatistics',
    ]);
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
    const options = parseArguments([
      '--mode',
      'all',
      '--assets-root',
      '/tmp/assets',
      '--storage-bucket',
      'dp-pdf-previews',
      '--allow-shared-private-bucket',
      '--confirm-production',
      '--resume-batch-id',
      '27462015-2a25-41bf-93b0-c4efd24d9a3a',
    ]);
    expect(options.resumeBatchId).toBe(
      '27462015-2a25-41bf-93b0-c4efd24d9a3a',
    );
    expect(options.allowSharedPrivateBucket).toBe(true);
    expect(() =>
      parseArguments([
        '--mode',
        'database',
        '--confirm-production',
        '--resume-batch-id',
        'not-a-uuid',
      ]),
    ).toThrow('--resume-batch-id must be a UUID');
    expect(() =>
      parseArguments(['--allow-shared-private-bucket']),
    ).toThrow('requires an explicit --storage-bucket');
  });

  it('resumes only the same failed archive batch', () => {
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
    for (const status of [
      'started',
      'audited',
      'rolled_back',
      'importing',
      'completed',
    ]) {
      expect(() =>
        validateBatchResume({ ...batch, status }, batch.id, 'all'),
      ).toThrow('accepts only the exact failed batch');
    }
    expect(() =>
      validateBatchResume(batch, null, 'all'),
    ).toThrow('requires --resume-batch-id');
  });

  it('requires an explicit override to share the private preview bucket', () => {
    delete process.env.R2_QUESTION_BANK_BUCKET;
    delete process.env.R2_PDF_PREVIEW_BUCKET;
    expect(() => resolveQuestionBankBucket()).toThrow(
      'R2_QUESTION_BANK_BUCKET is required',
    );

    process.env.R2_QUESTION_BANK_BUCKET = 'dp-pdf-previews';
    expect(() => resolveQuestionBankBucket()).toThrow(
      'only with an explicit --storage-bucket',
    );
    expect(() =>
      resolveQuestionBankBucket({
        allowSharedPrivateBucket: true,
      }),
    ).toThrow('only with an explicit --storage-bucket');
    expect(
      resolveQuestionBankBucket({
        storageBucket: 'dp-pdf-previews',
        allowSharedPrivateBucket: true,
      }),
    ).toBe('dp-pdf-previews');

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

  it('repairs partial rows only when the exact failed batch owns them', () => {
    const batchId = '27462015-2a25-41bf-93b0-c4efd24d9a3a';
    expect(
      canRepairExamMatePartialRow(
        { created_by_batch_id: batchId },
        batchId,
      ),
    ).toBe(true);
    expect(
      canRepairExamMatePartialRow(
        { created_by_batch_id: 'unrelated-batch' },
        batchId,
      ),
    ).toBe(false);
    expect(canRepairExamMatePartialRow({}, batchId)).toBe(false);
  });

  it('never reuses a same-reference question when its audited content differs', async () => {
    const batchId = '27462015-2a25-41bf-93b0-c4efd24d9a3a';
    const sourceQuestion = {
      sourceQuestionId: 'exam-mate-source-1',
      subjectId: 'biology',
      subject: 'Biology',
      curriculum: 'IB Diploma',
      reference: 'BIOLO/30_HL_Winter_2019_Q23',
      referenceParts: {
        sourceCourseCode: 'BIOLO',
        sourcePaperCode: '30',
        level: 'HL',
        season: 'Winter',
        year: 2019,
        questionNumber: '23',
      },
      topicsRaw: 'Cell biology',
      questionText: 'Audited Exam-Mate question text.',
      answerText: 'Audited Exam-Mate markscheme text.',
      questionImages: [],
      answerImages: [],
      sourceUrl: 'https://example.invalid/redacted',
      page: 1,
      eventKey: 'redacted',
    };
    const reusedByTheOldImporter = {
      id: '11111111-1111-4111-8111-111111111111',
      reference: sourceQuestion.reference,
      content: 'Different PESTLE question text.',
      mark_scheme: 'Different PESTLE markscheme text.',
      examiner_report: '',
      maximum_mark: 4,
      source_status: 'pestle_import_ready',
      source_metadata: { provider: 'PESTLE' },
    };
    reusedByTheOldImporter.content_hash =
      strictQuestionSignature(reusedByTheOldImporter);
    const oldVariant = {
      id: '22222222-2222-4222-8222-222222222222',
      question_id: reusedByTheOldImporter.id,
      dataset_id: '33333333-3333-4333-8333-333333333333',
      course_id: '44444444-4444-4444-8444-444444444444',
      topic_id: '55555555-5555-4555-8555-555555555555',
      paper_id: null,
      source_index: 999,
      source_occurrence: 0,
      canonical_source_subtopic_id:
        '66666666-6666-4666-8666-666666666666',
      difficulty_value: null,
      difficulty_label: null,
      section_raw: null,
      section_normalized: null,
      calculator_allowed: null,
      source_metadata: { provider: 'PESTLE' },
      created_by_batch_id: batchId,
      last_seen_batch_id: batchId,
    };
    const tables = {
      dp_qb_questions: [reusedByTheOldImporter],
      dp_qb_question_sources: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          provider: 'exam_mate',
          source_question_id: sourceQuestion.sourceQuestionId,
          question_id: reusedByTheOldImporter.id,
          created_by_batch_id: batchId,
          last_seen_batch_id: batchId,
        },
      ],
      dp_qb_question_variants: [oldVariant],
      dp_qb_variant_sources: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          provider: 'exam_mate',
          source_question_id: sourceQuestion.sourceQuestionId,
          source_course: 'biology:hl',
          source_topic: 'cell-biology',
          variant_id: oldVariant.id,
          created_by_batch_id: batchId,
          last_seen_batch_id: batchId,
        },
      ],
    };

    const resolved = await resolveExamMateForProduction(
      normalizedQuestion(sourceQuestion),
      snapshotClient(tables),
      {
        storageProvider: 'r2',
        storageBucket: 'private-question-bank',
        recoveryBatchId: batchId,
      },
    );

    expect(resolved.verificationStatus).toBe('passed');
    expect(resolved.rows.questions).toHaveLength(1);
    const exactQuestion = resolved.rows.questions[0];
    expect(exactQuestion.id).not.toBe(reusedByTheOldImporter.id);
    expect(exactQuestion.content).toBe(sourceQuestion.questionText);
    expect(exactQuestion.mark_scheme).toBe(sourceQuestion.answerText);
    expect(resolved.recoveryPlan.questionSourceUpdates).toEqual([
      expect.objectContaining({ question_id: exactQuestion.id }),
    ]);
    expect(resolved.recoveryPlan.variantUpdates).toEqual([
      expect.objectContaining({
        id: oldVariant.id,
        question_id: exactQuestion.id,
      }),
    ]);
    expect(resolved.recoveryPlan.deleteVariants).toEqual([]);
    expect(
      resolved.productionExpectations.questionCoreContentHashes[
        exactQuestion.id
      ],
    ).toBe(exactQuestion.content_hash);
  });

  it('applies only the exact deterministic partial-batch recovery plan', async () => {
    const batchId = '27462015-2a25-41bf-93b0-c4efd24d9a3a';
    const calls = [];
    const client = {
      from(table) {
        return {
          async upsert(rows, options) {
            calls.push({ operation: 'upsert', table, rows, options });
            return { error: null };
          },
          delete() {
            const filters = {};
            const query = {
              eq(column, value) {
                filters[column] = value;
                return query;
              },
              async select(columns) {
                calls.push({
                  operation: 'delete',
                  table,
                  columns,
                  filters: { ...filters },
                });
                return {
                  data: [
                    Object.fromEntries(
                      columns.split(',').map((column) => [
                        column,
                        filters[column],
                      ]),
                    ),
                  ],
                  error: null,
                };
              },
            };
            return query;
          },
        };
      },
    };
    const normalized = {
      recoveryPlan: {
        questionSourceUpdates: [
          { id: 'question-source-1', question_id: 'question-1' },
        ],
        variantUpdates: [],
        variantSourceUpdates: [],
        assetSourceUpdates: [],
        deleteVariantAssets: [
          {
            variant_id: 'variant-1',
            asset_id: 'asset-1',
            role: 'question',
            created_by_batch_id: batchId,
          },
        ],
        deleteVariantPapers: [
          {
            variant_id: 'variant-1',
            paper_id: 'paper-old',
            created_by_batch_id: batchId,
          },
        ],
        deleteCoursePapers: [
          { course_id: 'course-1', paper_id: 'paper-old' },
        ],
        deletePapers: [
          { id: 'paper-old', created_by_batch_id: batchId },
        ],
      },
    };

    const result = await applyPartialBatchRecovery(
      client,
      normalized,
      batchId,
      100,
    );

    expect(result.updates.dp_qb_question_sources.processedRows).toBe(1);
    expect(result.deletes).toEqual({
      dp_qb_question_variants: 0,
      dp_qb_variant_assets: 1,
      dp_qb_variant_papers: 1,
      dp_qb_question_subtopics: 0,
      dp_qb_course_papers: 1,
      dp_qb_papers: 1,
    });
    const ownedDeletes = calls.filter(
      (call) =>
        call.operation === 'delete' &&
        call.table !== 'dp_qb_course_papers',
    );
    expect(
      ownedDeletes.every(
        (call) => call.filters.created_by_batch_id === batchId,
      ),
    ).toBe(true);
    expect(
      calls.find(
        (call) =>
          call.operation === 'delete' &&
          call.table === 'dp_qb_course_papers',
      ).filters,
    ).toEqual({ course_id: 'course-1', paper_id: 'paper-old' });
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

  it('discovers private R2 buckets through a signed account-root request', async () => {
    process.env.R2_ACCOUNT_ID = 'account-id';
    process.env.R2_ACCESS_KEY_ID = 'access-key-id';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-access-key';
    delete process.env.R2_ENDPOINT;
    let requestedUrl = '';
    let requestedHeaders = {};
    globalThis.fetch = async (url, options) => {
      requestedUrl = String(url);
      requestedHeaders = options.headers;
      return new Response(
        [
          '<ListAllMyBucketsResult><Buckets>',
          '<Bucket><Name>dp-pdf-previews</Name></Bucket>',
          '<Bucket><Name>dp-question-bank-private</Name></Bucket>',
          '</Buckets></ListAllMyBucketsResult>',
        ].join(''),
        { status: 200 },
      );
    };

    await expect(listPrivateR2Buckets()).resolves.toEqual([
      'dp-pdf-previews',
      'dp-question-bank-private',
    ]);
    expect(requestedUrl).toBe(
      'https://account-id.r2.cloudflarestorage.com/',
    );
    expect(requestedHeaders.authorization).toContain('AWS4-HMAC-SHA256');
  });

  it('recognizes the pinned PNG, WebP, and retained BMP staging signatures', () => {
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
    expect(selectedFileSignature(Buffer.from('BMretained'), 'bmp')).toBe(true);
    expect(selectedFileSignature(Buffer.from('not-an-image'), 'png')).toBe(
      false,
    );
  });
});

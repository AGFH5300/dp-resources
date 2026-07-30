import { describe, expect, it } from 'vitest';

import {
  EXAM_MATE_OPTIMIZATION_AUDIT_SHA256,
  EXAM_MATE_OPTIMIZATION_EXPECTED,
  applyExamMateOptimizationPlan,
  selectedManifestRow,
} from '../scripts/question-bank/exam-mate-optimization.mjs';
import { parseArguments } from '../scripts/import-exam-mate-question-bank-optimized.mjs';

describe('Exam-Mate local optimization import', () => {
  it('pins the reviewed optimization audit and exact selected counts', () => {
    expect(EXAM_MATE_OPTIMIZATION_AUDIT_SHA256).toBe(
      'e9f5ef0767d2404caabf6d8b328e7b16361cc308841fd964fa99b513b2f3a4b8',
    );
    expect(EXAM_MATE_OPTIMIZATION_EXPECTED).toMatchObject({
      totalAssets: 31336,
      optimizedWebp: 31328,
      retainedPng: 8,
      retainedAfterOptimizerError: 2,
      selectedBytes: 863895760,
      savedBytes: 1349102904,
    });
  });

  it('maps an original Exam-Mate PNG to the selected verified WebP', () => {
    const original = {
      url: 'https://www.exam-mate.com/questions/example.png',
      sha256: 'a'.repeat(64),
      path: `assets/sha256/aa/${'a'.repeat(64)}.png`,
      bytes: 10_000,
      contentType: 'image/png',
      capturedAt: '2026-07-29T00:00:00.000Z',
    };
    const plan = {
      originalSourceHash: original.sha256,
      selectedHash: 'b'.repeat(64),
      selectedPath: `optimized-assets/sha256/bb/${'b'.repeat(64)}.webp`,
      selectedBytes: 3_000,
      selectedContentType: 'image/webp',
      selectedFormat: 'webp',
      optimized: true,
      savingsBytes: 7_000,
      savingsPercent: 70,
      pixelVerification: { passed: true },
    };
    expect(selectedManifestRow(original, plan)).toMatchObject({
      originalSha256: original.sha256,
      originalPath: original.path,
      sha256: plan.selectedHash,
      path: plan.selectedPath,
      bytes: plan.selectedBytes,
      contentType: 'image/webp',
      optimized: true,
    });
  });

  it('changes used physical hashes to selected hashes while preserving URL provenance', async () => {
    const url = 'https://www.exam-mate.com/questions/example.png';
    const originalHash = 'a'.repeat(64);
    const selectedHash = 'b'.repeat(64);
    const originalRow = {
      url,
      sha256: originalHash,
      path: `assets/sha256/aa/${originalHash}.png`,
      bytes: 10_000,
      contentType: 'image/png',
    };
    const plan = {
      originalSourceHash: originalHash,
      selectedHash,
      selectedPath: `optimized-assets/sha256/bb/${selectedHash}.webp`,
      selectedBytes: 3_000,
      selectedContentType: 'image/webp',
      selectedFormat: 'webp',
      optimized: true,
      savingsBytes: 7_000,
      savingsPercent: 70,
      pixelVerification: { passed: true },
      optimization: { pixelVerificationMode: 'selected-candidate-decoded-pixel-match' },
    };
    const normalized = {
      verificationStatus: 'passed',
      importerVersion: 'exam-mate-1.0.0',
      archiveIdentifier: 'source',
      archiveSha256: 'c'.repeat(64),
      expectedCounts: { importablePhysicalAssets: 1 },
      actualCounts: { importablePhysicalAssets: 1 },
      findings: [],
      source: {
        assetRoot: '/unused',
        verifiedAssetByUrl: new Map([[url, originalRow]]),
        usedAssetUrls: new Set([url]),
        usedPhysicalHashes: new Set([originalHash]),
      },
    };
    const audit = {
      planRows: [plan],
      planByOriginalHash: new Map([[originalHash, plan]]),
      summary: {
        assets: {
          optimized: 31328,
          retainedOriginal: 8,
          retainedAfterOptimizerError: 2,
        },
        bytes: {
          original: 2212998664,
          selected: 863895760,
          saved: 1349102904,
        },
      },
    };
    const result = await applyExamMateOptimizationPlan(normalized, audit);
    expect([...result.source.usedPhysicalHashes]).toEqual([selectedHash]);
    expect(result.source.verifiedAssetByUrl.get(url)).toMatchObject({
      url,
      originalSha256: originalHash,
      sha256: selectedHash,
      contentType: 'image/webp',
    });
    expect(result.importerVersion).toBe('exam-mate-1.1.0-optimized');
    expect(result.verificationStatus).toBe('passed');
  });

  it('requires the reviewed optimization audit and explicit production confirmation', () => {
    expect(() => parseArguments(['--mode', 'database'])).toThrow(
      '--confirm-production',
    );
    expect(() =>
      parseArguments(['--mode', 'assets', '--confirm-production']),
    ).toThrow('--assets-root');
  });
});

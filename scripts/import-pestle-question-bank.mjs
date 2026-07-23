#!/usr/bin/env node

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  normalizePestleArchive,
  publicPestleAuditReport,
} from './question-bank/pestle.mjs';
import {
  importDatabase,
  uploadAssets,
  verifyImportRows,
} from './question-bank/import.mjs';

function usage() {
  return `
DP Resources audited PESTLE question-bank importer

Usage:
  node scripts/import-pestle-question-bank.mjs --capture <directory> --mode <mode> [options]

Modes:
  audit       Validate the audited capture and emit aggregate findings.
  dry-run     Normalize every approved question and asset without external writes.
  database    Append missing normalized rows (requires --confirm-production).
  assets      Upload and verify missing private assets (requires --confirm-production).
  all         Append rows, upload assets, and verify the complete import.
  verify      Verify every intended row and asset against production without writes.

Options:
  --workers <n>             Asset upload concurrency (default: 4).
  --batch-size <n>          Database insert batch size (default: 250).
  --storage-provider <p>    r2 or supabase.
  --storage-bucket <name>   Explicit private bucket name.
  --report <path>           JSON report path.
  --confirm-production      Required for database/storage writes.
  --help                    Show this help.
`;
}

function parseArguments(argv) {
  const parsed = {
    capture: null,
    mode: 'audit',
    workers: undefined,
    batchSize: undefined,
    storageProvider: undefined,
    storageBucket: undefined,
    report: undefined,
    confirmProduction: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') return { help: true };
    if (token === '--confirm-production') parsed.confirmProduction = true;
    else if (token === '--capture') parsed.capture = argv[++index];
    else if (token === '--mode') parsed.mode = argv[++index];
    else if (token === '--workers') parsed.workers = Number(argv[++index]);
    else if (token === '--batch-size') parsed.batchSize = Number(argv[++index]);
    else if (token === '--storage-provider')
      parsed.storageProvider = argv[++index];
    else if (token === '--storage-bucket') parsed.storageBucket = argv[++index];
    else if (token === '--report') parsed.report = argv[++index];
    else throw new Error(`Unknown argument: ${token}`);
  }
  return parsed;
}

function defaultReportPath(options) {
  if (options.report) return path.resolve(options.report);
  return path.resolve(
    '.question-bank-reports',
    `pestle-${options.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
}

async function saveReport(filePath, report) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.capture) throw new Error('--capture is required.');
  if (!['audit', 'dry-run', 'database', 'assets', 'all', 'verify'].includes(options.mode))
    throw new Error(`Unsupported mode: ${options.mode}`);
  const capture = path.resolve(options.capture);
  const captureStat = await stat(capture);
  if (!captureStat.isDirectory())
    throw new Error('--capture must point to the extracted capture directory.');
  if (
    ['database', 'assets', 'all'].includes(options.mode) &&
    !options.confirmProduction
  )
    throw new Error(
      `${options.mode} can modify production data or storage. Run audit and dry-run first, then rerun with --confirm-production.`,
    );

  const normalized = await normalizePestleArchive(capture, {
    storageProvider: options.storageProvider,
    storageBucket: options.storageBucket,
  });
  const report = {
    ...publicPestleAuditReport(normalized),
    requestedMode: options.mode,
    productionWritePerformed: false,
  };
  const output = defaultReportPath(options);

  if (normalized.verificationStatus !== 'passed') {
    await saveReport(output, report);
    process.stdout.write(`${JSON.stringify({ ...report, reportPath: output }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  if (options.mode === 'database' || options.mode === 'all') {
    report.databaseImport = await importDatabase(normalized, {
      mode: options.mode,
      batchSize: options.batchSize,
      preserveExisting: true,
    });
    report.productionWritePerformed = true;
  }
  if (options.mode === 'assets' || options.mode === 'all') {
    report.assetUpload = await uploadAssets(normalized, {
      workers: options.workers,
      storageProvider: options.storageProvider,
      storageBucket: options.storageBucket,
    });
    report.productionWritePerformed = true;
    if (report.assetUpload.failed) process.exitCode = 1;
  }
  if (options.mode === 'verify' || options.mode === 'all') {
    report.databaseVerification = await verifyImportRows(normalized);
    if (report.databaseVerification.status !== 'passed') process.exitCode = 1;
  }

  await saveReport(output, report);
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: options.mode,
        archiveSha256: normalized.archiveSha256,
        verificationStatus: normalized.verificationStatus,
        actualCounts: normalized.actualCounts,
        databaseImport: report.databaseImport || null,
        assetUpload: report.assetUpload
          ? {
              provider: report.assetUpload.provider,
              bucket: report.assetUpload.bucket,
              skippedVerified: report.assetUpload.skippedVerified,
              uploaded: report.assetUpload.uploaded,
              failed: report.assetUpload.failed,
            }
          : null,
        databaseVerification: report.databaseVerification || null,
        reportPath: output,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`PESTLE importer failed: ${error.message || error}\n`);
  process.exitCode = 1;
});

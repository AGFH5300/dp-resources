#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  normalizeArchive,
  publicAuditReport,
  resolveArchiveInput,
} from './question-bank/archive.mjs';
import {
  importDatabase,
  uploadAssets,
  verifyDatabase,
} from './question-bank/import.mjs';

function usage() {
  return `
DP Resources IB DP question-bank importer

Usage:
  node scripts/import-question-bank.mjs --archive <zip-or-directory> --mode <mode> [options]

Modes:
  audit       Validate source files and verified archive counts only.
  dry-run     Normalize all rows, hash assets, and report planned row counts.
  database    Upsert normalized database rows (requires --confirm-production).
  assets      Upload/verify pending assets (requires --confirm-production).
  all         Database import, asset upload, and final verification.
  verify      Read-only verification against already imported database rows.

Options:
  --workers <n>             Asset hashing/upload concurrency (default: 6/4).
  --batch-size <n>          Database upsert batch size (default: 250).
  --storage-provider <p>    r2 or supabase.
  --storage-bucket <name>   Explicit private bucket name.
  --report <path>           JSON report path.
  --resume                  Explicitly document a resumed assets/all run.
  --confirm-production      Required for database/storage writes.
  --help                    Show this help.
`;
}

function parseArguments(argv) {
  const parsed = {
    archive: null,
    mode: 'audit',
    workers: undefined,
    batchSize: undefined,
    storageProvider: undefined,
    storageBucket: undefined,
    report: undefined,
    resume: false,
    confirmProduction: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') return { help: true };
    if (token === '--resume') parsed.resume = true;
    else if (token === '--confirm-production') parsed.confirmProduction = true;
    else if (token === '--archive') parsed.archive = argv[++index];
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

function reportPath(options, archiveIdentifier) {
  if (options.report) return path.resolve(options.report);
  return path.resolve(
    '.question-bank-reports',
    `${archiveIdentifier}-${options.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
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
  if (!options.archive) throw new Error('--archive is required.');
  if (!['audit', 'dry-run', 'database', 'assets', 'all', 'verify'].includes(options.mode))
    throw new Error(`Unsupported mode: ${options.mode}`);
  const writesProduction = ['database', 'assets', 'all'].includes(options.mode);
  if (writesProduction && !options.confirmProduction)
    throw new Error(
      `${options.mode} can modify production data or storage. Review the migration and dry-run report, then rerun with --confirm-production.`,
    );

  const input = await resolveArchiveInput(options.archive);
  try {
    const normalized = await normalizeArchive(input.root, {
      workers: options.workers,
      storageProvider: options.storageProvider,
      storageBucket: options.storageBucket,
    });
    const report = {
      ...publicAuditReport(normalized),
      requestedMode: options.mode,
      resume: options.resume,
      productionWritePerformed: false,
    };
    const output = reportPath(options, normalized.archiveIdentifier);

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
      if (report.assetUpload.failed > 0) process.exitCode = 1;
    }
    if (options.mode === 'verify' || options.mode === 'all') {
      report.databaseVerification = await verifyDatabase(normalized);
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
  } finally {
    await input.cleanup();
  }
}

main().catch((error) => {
  process.stderr.write(`Question-bank importer failed: ${error.message || error}\n`);
  process.exitCode = 1;
});

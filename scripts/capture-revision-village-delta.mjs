#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  JULY_BASE_ARCHIVE_SHA256,
  RV_FINALIZER_V102_SHA256,
  RV_INDEXER_V141_SHA256,
  assertDecryptedQuestion,
  classifyTargets,
  explicitQuestionsFromNextData,
  extractNextData,
  extractVerifiedTargets,
  readNdjson,
  sha256File,
  sourceQuestionId,
  writeNdjson,
} from './question-bank/revision-village-delta.mjs';

const VERSION = '1.0.0';
const DEFAULT_INDEXER = path.join(
  homedir(),
  'Desktop/scripts/dp-site/Revision Village/Revision Village Indexing Scripts/packages/revision-village-indexer-v1.4.1/revision-village-indexer.mjs',
);
const DEFAULT_FINALIZER = path.join(
  homedir(),
  'Desktop/scripts/dp-site/Revision Village/Revision Village Indexing Scripts/packages/revision-village-question-bank-finalizer-v1.0.2/finalize-revision-village-question-bank.mjs',
);
const DEFAULT_BASE_ARCHIVE = path.join(
  homedir(),
  'Documents/DP Resources Import Sources/Revision Village/RevisionVillage-question-bank-import-20260727T104233.zip',
);

function usage() {
  return `Revision Village verified delta capture v${VERSION}

Usage:
  node scripts/capture-revision-village-delta.mjs --verified-report <json> [options]

Options:
  --verified-report <path>  RV-VERIFIED-ID-DELTA.json (required)
  --output <path>           New capture/package directory
  --base-archive <path>     Locked July 2026 RV archive
  --indexer <path>          revision-village-indexer-v1.4.1.mjs
  --finalizer <path>        finalize-revision-village-question-bank-v1.0.2.mjs
  --api-workers <n>         Existing indexer API workers (default: 8)
  --asset-workers <n>       Finalizer direct-asset workers (default: 20)
  --expected-targets <n>    Verified questions expected (default: 42)
  --expected-active <n>     Importable questions expected (default: 41)
  --skip-finalizer          Stop after the filtered decrypted capture
  --help                    Show this help

Safety:
- verifies the locked July base archive SHA-256;
- verifies the exact known v1.4.1 indexer and v1.0.2 finalizer SHA-256;
- accepts IDs only from explicit serialized questions[] payloads;
- quarantines retired subject groups (currently IB English B);
- performs no Supabase, R2, Drive or production writes.
`;
}

function stamp() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function parseArgs(argv) {
  const options = {
    verifiedReport: null,
    output: null,
    baseArchive: DEFAULT_BASE_ARCHIVE,
    indexer: DEFAULT_INDEXER,
    finalizer: DEFAULT_FINALIZER,
    apiWorkers: 8,
    assetWorkers: 20,
    expectedTargets: 42,
    expectedActive: 41,
    skipFinalizer: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') return { help: true };
    if (token === '--verified-report') options.verifiedReport = argv[++i];
    else if (token === '--output') options.output = argv[++i];
    else if (token === '--base-archive') options.baseArchive = argv[++i];
    else if (token === '--indexer') options.indexer = argv[++i];
    else if (token === '--finalizer') options.finalizer = argv[++i];
    else if (token === '--api-workers') options.apiWorkers = Number(argv[++i]);
    else if (token === '--asset-workers') options.assetWorkers = Number(argv[++i]);
    else if (token === '--expected-targets') options.expectedTargets = Number(argv[++i]);
    else if (token === '--expected-active') options.expectedActive = Number(argv[++i]);
    else if (token === '--skip-finalizer') options.skipFinalizer = true;
    else throw new Error(`Unknown option: ${token}`);
  }
  if (!options.verifiedReport) throw new Error('--verified-report is required.');
  for (const [name, value, min, max] of [
    ['--api-workers', options.apiWorkers, 1, 20],
    ['--asset-workers', options.assetWorkers, 1, 40],
    ['--expected-targets', options.expectedTargets, 1, 1000],
    ['--expected-active', options.expectedActive, 1, 1000],
  ]) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer from ${min} to ${max}.`);
    }
  }
  options.verifiedReport = path.resolve(options.verifiedReport);
  options.baseArchive = path.resolve(options.baseArchive);
  options.indexer = path.resolve(options.indexer);
  options.finalizer = path.resolve(options.finalizer);
  options.output = path.resolve(
    options.output ||
      path.join(path.dirname(options.verifiedReport), `RV-DELTA-PACKAGE-${stamp()}`),
  );
  return options;
}

async function assertFile(file, label) {
  try {
    await access(file);
  } catch {
    throw new Error(`${label} was not found: ${file}`);
  }
}

async function assertSha(file, expected, label) {
  await assertFile(file, label);
  const actual = await sha256File(file);
  if (actual !== expected) {
    throw new Error(
      `${label} SHA-256 mismatch. Expected ${expected}, received ${actual}. Refusing to continue.`,
    );
  }
  return actual;
}

async function fetchText(url, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/151 Safari/537.36',
        },
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error(`Unable to fetch ${url}: ${lastError?.message || 'unknown error'}`);
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function sha12(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function runNode(script, args, label) {
  console.log(`\n${label}`);
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=8192', script, ...args],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} exited with status ${result.status}.`);
  }
}

async function newestDirectory(parent, prefix) {
  const names = (await readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort();
  if (!names.length) throw new Error(`No ${prefix}* directory was produced in ${parent}.`);
  return path.join(parent, names.at(-1));
}

function filterPapers(value, neededIds) {
  if (Array.isArray(value)) return value.filter((row) => neededIds.has(String(row?.id || '').toLowerCase()));
  if (value && typeof value === 'object' && Array.isArray(value.papers)) {
    return {
      ...value,
      papers: value.papers.filter((row) => neededIds.has(String(row?.id || '').toLowerCase())),
    };
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([key, row]) =>
        neededIds.has(String(row?.id || key || '').toLowerCase()),
      ),
    );
  }
  return [];
}

function idsFromQuestion(question) {
  const result = new Set();
  for (const value of question?.paperIds || question?.paper_ids || []) {
    if (value) result.add(String(value).toLowerCase());
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  console.log(`\nRevision Village verified delta capture v${VERSION}`);
  console.log(`Verified report: ${options.verifiedReport}`);
  console.log(`Output:          ${options.output}`);

  await assertFile(options.verifiedReport, 'Verified delta report');
  const baseArchiveSha256 = await assertSha(
    options.baseArchive,
    JULY_BASE_ARCHIVE_SHA256,
    'Locked July Revision Village base archive',
  );
  const indexerSha256 = await assertSha(
    options.indexer,
    RV_INDEXER_V141_SHA256,
    'Revision Village v1.4.1 indexer',
  );
  const finalizerSha256 = await assertSha(
    options.finalizer,
    RV_FINALIZER_V102_SHA256,
    'Revision Village v1.0.2 finalizer',
  );

  const verifiedReport = JSON.parse(await readFile(options.verifiedReport, 'utf8'));
  const verifiedTargets = extractVerifiedTargets(verifiedReport, {
    expected: options.expectedTargets,
  });
  const { active, quarantined } = classifyTargets(verifiedTargets);
  if (active.length !== options.expectedActive) {
    throw new Error(
      `Expected ${options.expectedActive} active targets after retirement policy; found ${active.length}.`,
    );
  }
  if (active.length + quarantined.length !== verifiedTargets.length) {
    throw new Error('Target classification lost verified questions.');
  }

  console.log(`Verified targets: ${verifiedTargets.length}`);
  console.log(`Active targets:   ${active.length}`);
  console.log(`Quarantined:      ${quarantined.length}`);

  const rawNextData = path.join(options.output, 'raw-next-data');
  const rawHtml = path.join(options.output, 'raw-html');
  const evidence = path.join(options.output, 'evidence');
  await mkdir(rawNextData, { recursive: true });
  await mkdir(rawHtml, { recursive: true });
  await mkdir(evidence, { recursive: true });

  const targetsByRoute = new Map();
  for (const target of verifiedTargets) {
    const rows = targetsByRoute.get(target.route) || [];
    rows.push(target);
    targetsByRoute.set(target.route, rows);
  }
  const routes = [...targetsByRoute.keys()].sort();
  const routeEvidence = [];

  console.log(`\nCapturing ${routes.length} verified source routes...`);
  await runPool(routes, Math.min(options.apiWorkers, 8), async (route, index) => {
    const html = await fetchText(route);
    const nextData = extractNextData(html);
    if (!nextData) throw new Error(`No __NEXT_DATA__ payload found on ${route}.`);
    const explicit = explicitQuestionsFromNextData(nextData);
    const explicitById = new Map(explicit.map((row) => [String(row.id).toLowerCase(), row]));
    const expectedOnRoute = targetsByRoute.get(route) || [];
    const missing = expectedOnRoute.filter((target) => !explicitById.has(target.id));
    if (missing.length) {
      throw new Error(
        `Verified target(s) missing from explicit questions[] on ${route}: ` +
          missing.map((row) => `${row.id} ${row.reference}`).join(', '),
      );
    }
    for (const target of expectedOnRoute) {
      const actualReference = String(explicitById.get(target.id)?.reference || '').trim();
      if (actualReference && actualReference !== target.reference) {
        throw new Error(
          `Reference changed for ${target.id}: verified ${target.reference}, live ${actualReference}.`,
        );
      }
    }

    const key = `${String(index + 1).padStart(3, '0')}-${sha12(route)}`;
    await writeFile(path.join(rawHtml, `${key}.html`), html, 'utf8');
    await writeFile(path.join(rawNextData, `${key}.json`), `${JSON.stringify(nextData)}\n`, 'utf8');
    routeEvidence.push({
      route,
      htmlBytes: Buffer.byteLength(html),
      explicitQuestionCount: explicit.length,
      targetIds: expectedOnRoute.map((row) => row.id).sort(),
    });
    console.log(`[${index + 1}/${routes.length}] ${route} — explicit questions ${explicit.length}`);
  });

  routeEvidence.sort((a, b) => a.route.localeCompare(b.route));
  await writeFile(
    path.join(evidence, 'route-evidence.json'),
    `${JSON.stringify(routeEvidence, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(evidence, 'verified-targets.json'),
    `${JSON.stringify({ active, quarantined }, null, 2)}\n`,
    'utf8',
  );

  runNode(
    options.indexer,
    [
      '--capture',
      options.output,
      '--api-workers',
      String(options.apiWorkers),
      '--asset-workers',
      '1',
      '--fresh',
      '--no-assets',
    ],
    'Running locked Revision Village v1.4.1 decrypting indexer...',
  );

  const processed = await newestDirectory(options.output, 'api-processed-');
  const uniqueFile = path.join(processed, 'unique-questions.ndjson');
  const occurrenceFile = path.join(processed, 'question-occurrences.ndjson');
  const paperFile = path.join(processed, 'papers.json');
  const unique = await readNdjson(uniqueFile);
  const occurrences = await readNdjson(occurrenceFile);
  const uniqueById = new Map();
  for (const row of unique) {
    const id = sourceQuestionId(row);
    if (id) uniqueById.set(id, row);
  }

  const missingAfterDecrypt = verifiedTargets.filter((target) => !uniqueById.has(target.id));
  if (missingAfterDecrypt.length) {
    throw new Error(
      'The locked v1.4.1 indexer did not produce all verified targets: ' +
        missingAfterDecrypt.map((row) => `${row.id} ${row.reference}`).join(', '),
    );
  }

  for (const target of verifiedTargets) {
    assertDecryptedQuestion(uniqueById.get(target.id));
  }

  const activeIds = new Set(active.map((row) => row.id));
  const quarantinedIds = new Set(quarantined.map((row) => row.id));
  const activeQuestions = active.map((target) => uniqueById.get(target.id));
  const quarantinedQuestions = quarantined.map((target) => ({
    ...uniqueById.get(target.id),
    quarantineReason: 'retired-subject-group',
  }));
  const activeOccurrences = occurrences.filter((row) => activeIds.has(sourceQuestionId(row)));

  const occurrenceCoverage = new Set(activeOccurrences.map(sourceQuestionId).filter(Boolean));
  const missingOccurrences = active.filter((target) => !occurrenceCoverage.has(target.id));
  if (missingOccurrences.length) {
    throw new Error(
      'Verified active questions are missing placement occurrences: ' +
        missingOccurrences.map((row) => `${row.id} ${row.reference}`).join(', '),
    );
  }

  const offline = path.join(options.output, `offline-processed-delta-${stamp()}`);
  await mkdir(offline, { recursive: true });
  await writeNdjson(path.join(offline, 'unique-questions.ndjson'), activeQuestions);
  await writeNdjson(path.join(offline, 'question-occurrences.ndjson'), activeOccurrences);
  await writeFile(path.join(offline, 'asset-manifest.json'), '[]\n', 'utf8');

  let papers = [];
  try {
    papers = JSON.parse(await readFile(paperFile, 'utf8'));
  } catch {
    papers = [];
  }
  const neededPaperIds = new Set();
  for (const question of activeQuestions) {
    for (const id of idsFromQuestion(question)) neededPaperIds.add(id);
  }
  await writeFile(
    path.join(offline, 'papers.json'),
    `${JSON.stringify(filterPapers(papers, neededPaperIds), null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(offline, 'summary.json'),
    `${JSON.stringify(
      {
        provider: 'revision_village',
        bundleType: 'verified_delta_source',
        generatedAt: new Date().toISOString(),
        baseArchiveSha256,
        verifiedTargets: verifiedTargets.length,
        activeQuestions: activeQuestions.length,
        quarantinedQuestions: quarantinedQuestions.length,
        questionOccurrences: activeOccurrences.length,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await writeNdjson(
    path.join(evidence, 'quarantined-retired-subjects.ndjson'),
    quarantinedQuestions,
  );

  const verifiedReportSha256 = await sha256File(options.verifiedReport);
  const prePackageManifest = {
    provider: 'revision_village',
    bundleType: 'verified_delta',
    generatedAt: new Date().toISOString(),
    baseArchiveSha256,
    verifiedReportSha256,
    toolchain: {
      orchestratorVersion: VERSION,
      indexerSha256,
      finalizerSha256,
    },
    counts: {
      verified: verifiedTargets.length,
      active: active.length,
      quarantined: quarantined.length,
      occurrences: activeOccurrences.length,
    },
    activeIds: active.map((row) => row.id),
    quarantined: quarantined.map((row) => ({
      id: row.id,
      reference: row.reference,
      subjectGroup: row.subjectGroup,
      reason: row.quarantineReason,
    })),
    productionWritesPerformed: false,
  };
  await writeFile(
    path.join(evidence, 'delta-manifest.pre-package.json'),
    `${JSON.stringify(prePackageManifest, null, 2)}\n`,
    'utf8',
  );

  if (options.skipFinalizer) {
    console.log('\nFiltered decrypted capture complete; finalizer skipped by request.');
    console.log(`Offline delta: ${offline}`);
    return;
  }

  const outputZip = path.join(options.output, `RevisionVillage-verified-delta-${stamp()}.zip`);
  runNode(
    options.finalizer,
    [
      '--capture',
      options.output,
      '--workers',
      String(options.assetWorkers),
      '--output',
      outputZip,
    ],
    'Running locked Revision Village v1.0.2 asset/media finalizer...',
  );

  await assertFile(outputZip, 'Finalized delta ZIP');
  const packageZipSha256 = await sha256File(outputZip);
  const finalManifest = {
    ...prePackageManifest,
    package: {
      path: outputZip,
      sha256: packageZipSha256,
    },
  };
  const finalManifestFile = path.join(options.output, 'revision-village-delta-manifest.json');
  await writeFile(finalManifestFile, `${JSON.stringify(finalManifest, null, 2)}\n`, 'utf8');
  const manifestSha256 = await sha256File(finalManifestFile);
  await writeFile(
    path.join(options.output, 'checksums.sha256'),
    `${packageZipSha256}  ${path.basename(outputZip)}\n${manifestSha256}  ${path.basename(
      finalManifestFile,
    )}\n${verifiedReportSha256}  source-verified-report.json\n`,
    'utf8',
  );
  await writeFile(
    path.join(options.output, 'source-verified-report.json'),
    `${JSON.stringify(verifiedReport, null, 2)}\n`,
    'utf8',
  );

  console.log('\n============================================================');
  console.log('REVISION VILLAGE VERIFIED DELTA PACKAGE COMPLETE');
  console.log('============================================================');
  console.log(`Verified questions : ${verifiedTargets.length}`);
  console.log(`Packaged active    : ${active.length}`);
  console.log(`Quarantined        : ${quarantined.length}`);
  console.log(`Package ZIP        : ${outputZip}`);
  console.log(`Package SHA-256    : ${packageZipSha256}`);
  console.log(`Manifest           : ${finalManifestFile}`);
  console.log('Production writes  : NONE');
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.stack || error.message}`);
  process.exitCode = 1;
});

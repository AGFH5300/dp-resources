#!/usr/bin/env node

import crypto from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_BASELINE = 'audits/external-content-watch-baseline-20260909.json';
const DEFAULT_STATE = 'audits/external-content-index-state.json';
const DEFAULT_REPORT = 'audits/external-content-delta-latest.json';

const USER_AGENT =
  'DP-Resources-External-Content-Indexer/1.0 (+metadata-only discovery; authorised archives required for protected-content imports)';

const SOURCE_CONFIG = {
  exam_mate: {
    displayName: 'Exam-Mate',
    captureMode: 'metadata-only',
    pages: [
      'https://www.exam-mate.com/',
    ],
  },
  revision_village: {
    displayName: 'Revision Village',
    captureMode: 'metadata-only',
    pages: [
      'https://www.revisionvillage.com/prediction-exams/',
      'https://www.revisionvillage.com/blog/internal-assessment-resources/',
    ],
  },
  revision_town: {
    displayName: 'Revision Town',
    captureMode: 'metadata-only',
    pages: [
      'https://revisiontown.com/ib/',
      'https://revisiontown.com/ib-mathematics/',
    ],
  },
  mortar_and_pestle: {
    displayName: 'Mortar and Pestle',
    captureMode: 'fingerprint-only',
    pages: [
      'https://pestle.pirateib.su/app/',
    ],
  },
  save_my_exams: {
    displayName: 'Save My Exams',
    captureMode: 'metadata-only',
    pages: [
      'https://www.savemyexams.com/dp/',
      'https://www.savemyexams.com/dp/maths/mock-exams/',
      'https://www.savemyexams.com/dp/maths/ib/aa/21/mock-exams/',
      'https://www.savemyexams.com/dp/business/mock-exams/',
      'https://www.savemyexams.com/dp/chemistry/ib/23/mock-exams/',
      'https://www.savemyexams.com/dp/biology/mock-exams/',
      'https://www.savemyexams.com/dp/physics/mock-exams/',
      'https://www.savemyexams.com/dp/economics/mock-exams/',
      'https://www.savemyexams.com/dp/psychology/ib/25/mock-exams/',
    ],
  },
};

const IMPORTERS = {
  exam_mate: {
    command: 'node',
    script: 'scripts/import-exam-mate-question-bank-optimized.mjs',
    inputFlag: '--archive',
  },
  revision_village: {
    command: 'node',
    script: 'scripts/import-revision-village-question-bank.mjs',
    inputFlag: '--archive',
  },
  revision_town: {
    command: 'node',
    script: 'scripts/import-question-bank.mjs',
    inputFlag: '--archive',
  },
  mortar_and_pestle: {
    command: 'node',
    script: 'scripts/import-pestle-question-bank.mjs',
    inputFlag: '--capture',
  },
};

const RELEVANT_TEXT = /\b(IB|Diploma|DP|question|paper|mark\s*scheme|mock|prediction|revision|note|exam|IA|internal assessment|HL|SL|analysis|approaches|applications|interpretation|biology|chemistry|physics|psychology|economics|business|history|english|spanish|french|ESS|environmental|TOK|theory of knowledge)\b/i;
const GENERIC_TEXT = /^(home|about|contact|help|pricing|login|register|learn more|read more|view all|subjects?|resources?|menu)$/i;

function parseArgs(argv) {
  const options = {
    mode: 'scan',
    baseline: DEFAULT_BASELINE,
    state: DEFAULT_STATE,
    report: DEFAULT_REPORT,
    writeState: false,
    importManifest: null,
    confirmProduction: false,
    only: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--mode') options.mode = argv[++i];
    else if (token === '--baseline') options.baseline = argv[++i];
    else if (token === '--state') options.state = argv[++i];
    else if (token === '--report') options.report = argv[++i];
    else if (token === '--write-state') options.writeState = true;
    else if (token === '--import-manifest') options.importManifest = argv[++i];
    else if (token === '--confirm-production') options.confirmProduction = true;
    else if (token === '--only') options.only = argv[++i].split(',').map((value) => value.trim()).filter(Boolean);
    else if (token === '--help' || token === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (!['scan', 'import-authorized'].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }
  return options;
}

function usage() {
  return `
DP Resources external-content delta indexer

Discovery only (safe default):
  node scripts/external-content-indexer.mjs --mode scan

Persist the current metadata/fingerprint state after review:
  node scripts/external-content-indexer.mjs --mode scan --write-state

Scan selected sources only:
  node scripts/external-content-indexer.mjs --mode scan --only revision_village,save_my_exams

Import authorised local captures after their own audit/dry-run gates:
  node scripts/external-content-indexer.mjs --mode import-authorized \\
    --import-manifest /secure/path/authorised-external-imports.json \\
    --confirm-production

Authorised import manifest example:
  {
    "exam_mate": "/secure/path/exam-mate-reviewed.zip",
    "revision_village": "/secure/path/revision-village-reviewed.zip",
    "revision_town": "/secure/path/revision-town-reviewed.zip",
    "mortar_and_pestle": "/secure/path/pestle-authorised-capture"
  }

Important:
  - Web discovery stores metadata, links and fingerprints only.
  - It never copies third-party question text, markschemes, notes or protected assets.
  - Production question-bank writes happen only from explicitly authorised local captures.
  - Every production import runs audit -> dry-run -> all -> verify through the existing importer.
`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseText(value) {
  return stripTags(value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(rawHref, baseUrl) {
  if (!rawHref) return null;
  if (/^(javascript:|mailto:|tel:|#)/i.test(rawHref.trim())) return null;
  try {
    const parsed = new URL(rawHref, baseUrl);
    parsed.hash = '';
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normaliseText(match[1]) : '';
}

function extractDescription(html) {
  const match = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  return match ? normaliseText(match[1]) : '';
}

function extractHeadings(html) {
  const values = [];
  for (const match of html.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = normaliseText(match[2]);
    if (!text || text.length > 220 || GENERIC_TEXT.test(text)) continue;
    if (!RELEVANT_TEXT.test(text)) continue;
    values.push({ level: Number(match[1]), text });
  }
  return values;
}

function extractLinks(html, baseUrl) {
  const values = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1];
    const text = normaliseText(match[2]);
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    const href = absoluteUrl(hrefMatch?.[1], baseUrl);
    if (!href || !text || text.length > 240 || GENERIC_TEXT.test(text)) continue;
    if (!RELEVANT_TEXT.test(text) && !/\/dp\/|\/ib\/|prediction|mock|past-paper|question|revision/i.test(href)) continue;
    values.push({ text, url: href });
  }
  return values;
}

function classifyItem(item) {
  const haystack = `${item.text} ${item.url}`.toLowerCase();
  if (haystack.includes('prediction')) return 'prediction_exam';
  if (haystack.includes('mock')) return 'mock_exam';
  if (haystack.includes('internal assessment') || /\bia\b/.test(haystack)) return 'ia_resource';
  if (haystack.includes('mark scheme') || haystack.includes('markscheme')) return 'markscheme';
  if (haystack.includes('past paper') || /\bpaper\b/.test(haystack)) return 'paper_or_practice';
  if (haystack.includes('question')) return 'question_bank_or_exam_questions';
  if (haystack.includes('note')) return 'revision_notes';
  if (haystack.includes('tok') || haystack.includes('theory of knowledge')) return 'tok_resource';
  return 'catalog_resource';
}

function canonicalItem(source, pageUrl, item) {
  const text = normaliseText(item.text);
  const url = item.url;
  const kind = classifyItem({ text, url });
  const key = sha256(`${source}\n${kind}\n${text.toLowerCase()}\n${url}`).slice(0, 32);
  return { key, source, kind, text, url, discoveredOn: pageUrl };
}

function dedupeItems(items) {
  const map = new Map();
  for (const item of items) map.set(item.key, item);
  return [...map.values()].sort((a, b) =>
    `${a.kind}|${a.text}|${a.url}`.localeCompare(`${b.kind}|${b.text}|${b.url}`),
  );
}

function sourceSpecificSignals(source, url, html) {
  const text = normaliseText(html);
  const signals = [];

  if (source === 'revision_village' && /November\s+2026\s+Prediction Exams.*released/i.test(text)) {
    signals.push({
      id: 'revision-village-november-2026-prediction-exams',
      status: 'confirmed',
      kind: 'prediction_exam_release',
      label: 'November 2026 Prediction Exams released',
      url,
    });
  }
  if (source === 'revision_village' && /Theory of Knowledge.*Ab Initio.*French.*Spanish.*now available/i.test(text)) {
    signals.push({
      id: 'revision-village-tok-ab-initio-french-spanish',
      status: 'confirmed',
      kind: 'new_subject_availability',
      label: 'Theory of Knowledge and French/Spanish Ab Initio now available',
      url,
    });
  }
  if (source === 'revision_town') {
    const date = text.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2})\b/i)?.[1];
    if (date) {
      signals.push({
        id: `revision-town-page-date-${date.toLowerCase().replace(/\s+/g, '-')}`,
        status: 'candidate',
        kind: 'page_refresh_marker',
        label: `IB hub page marker: ${date}`,
        url,
      });
    }
  }
  if (source === 'exam_mate') {
    const topical = text.match(/(\d[\d,]*)\s+Topical Past Paper Questions/i)?.[1];
    const yearly = text.match(/(\d[\d,]*)\s+Yearly Past Papers/i)?.[1];
    if (topical) signals.push({ id: `exam-mate-topical-count-${topical.replace(/,/g, '')}`, status: 'candidate', kind: 'catalog_count', label: `${topical} topical past-paper questions`, url });
    if (yearly) signals.push({ id: `exam-mate-yearly-count-${yearly.replace(/,/g, '')}`, status: 'candidate', kind: 'catalog_count', label: `${yearly} yearly past papers`, url });
  }
  if (source === 'mortar_and_pestle') {
    signals.push({
      id: `mortar-pestle-page-${sha256(text).slice(0, 16)}`,
      status: 'fingerprint_only',
      kind: 'page_fingerprint',
      label: 'Mortar and Pestle application metadata fingerprint',
      url,
    });
  }
  return signals;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
    },
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return {
    status: response.status,
    finalUrl: response.url,
    html,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function knownSignalIdsFromBaseline(baseline) {
  const known = new Set();
  const rv = baseline?.sources?.revision_village?.verified_new_or_changed || [];
  if (rv.some((entry) => entry.kind === 'prediction_exams' && entry.cohort === 'November 2026')) {
    known.add('revision-village-november-2026-prediction-exams');
  }
  return known;
}

async function scanSource(source, config, previousState) {
  const pages = [];
  const allItems = [];
  const signals = [];

  for (const pageUrl of config.pages) {
    try {
      const response = await fetchPage(pageUrl);
      const page = {
        requestedUrl: pageUrl,
        finalUrl: response.finalUrl,
        status: response.status,
        title: extractTitle(response.html),
        description: extractDescription(response.html),
        etag: response.etag,
        lastModified: response.lastModified,
        htmlSha256: sha256(response.html),
        headings: config.captureMode === 'fingerprint-only' ? [] : extractHeadings(response.html),
      };

      const links = config.captureMode === 'fingerprint-only' ? [] : extractLinks(response.html, response.finalUrl);
      const items = dedupeItems(links.map((link) => canonicalItem(source, response.finalUrl, link)));
      page.itemCount = items.length;
      page.catalogFingerprint = sha256(JSON.stringify(items.map(({ key, kind, text, url }) => ({ key, kind, text, url }))));
      pages.push(page);
      allItems.push(...items);
      signals.push(...sourceSpecificSignals(source, response.finalUrl, response.html));
    } catch (error) {
      pages.push({ requestedUrl: pageUrl, error: String(error.message || error) });
    }
  }

  const items = dedupeItems(allItems);
  const previousKeys = new Set(previousState?.items?.map((item) => item.key) || []);
  const newItems = items.filter((item) => !previousKeys.has(item.key));
  const currentKeys = new Set(items.map((item) => item.key));
  const removedItems = (previousState?.items || []).filter((item) => !currentKeys.has(item.key));

  return {
    source,
    displayName: config.displayName,
    captureMode: config.captureMode,
    scannedAt: new Date().toISOString(),
    pages,
    items,
    signals,
    delta: {
      newItems,
      removedItems,
      changed: newItems.length > 0 || removedItems.length > 0,
    },
  };
}

async function scan(options) {
  const baseline = await readJsonIfExists(options.baseline, {});
  const previousState = await readJsonIfExists(options.state, { sources: {} });
  const selected = options.only || Object.keys(SOURCE_CONFIG);
  const knownSignalIds = knownSignalIdsFromBaseline(baseline);

  const results = {};
  for (const source of selected) {
    const config = SOURCE_CONFIG[source];
    if (!config) throw new Error(`Unknown source in --only: ${source}`);
    process.stderr.write(`Scanning ${config.displayName}...\n`);
    results[source] = await scanSource(source, config, previousState.sources?.[source]);
  }

  const currentSignalIds = new Set();
  const confirmedSignals = [];
  const candidateSignals = [];
  for (const result of Object.values(results)) {
    for (const signal of result.signals) {
      currentSignalIds.add(signal.id);
      const wasKnown = knownSignalIds.has(signal.id) || previousState.signalIds?.includes(signal.id);
      if (wasKnown) continue;
      if (signal.status === 'confirmed') confirmedSignals.push({ source: result.source, ...signal });
      else candidateSignals.push({ source: result.source, ...signal });
    }
  }

  const report = {
    schema: 'dp_external_content_delta_v1',
    generatedAt: new Date().toISOString(),
    baselinePath: options.baseline,
    previousStatePath: options.state,
    sourcePolicy: {
      discovery: 'metadata-links-fingerprints-only',
      protectedContent: 'never-copied-by-web-scanner',
      productionImport: 'authorised-local-capture-only',
      duplicateStrategy: 'stable-metadata-key-plus-existing-importer-idempotency',
    },
    confirmedSignals,
    candidateSignals,
    sources: Object.fromEntries(
      Object.entries(results).map(([source, result]) => [source, {
        displayName: result.displayName,
        captureMode: result.captureMode,
        scannedAt: result.scannedAt,
        pages: result.pages,
        itemCount: result.items.length,
        newItemCount: result.delta.newItems.length,
        removedItemCount: result.delta.removedItems.length,
        newItems: result.delta.newItems,
        removedItems: result.delta.removedItems,
        signals: result.signals,
      }]),
    ),
  };

  await mkdir(path.dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (options.writeState) {
    const mergedSources = { ...(previousState.sources || {}) };
    for (const [source, result] of Object.entries(results)) {
      mergedSources[source] = {
        scannedAt: result.scannedAt,
        captureMode: result.captureMode,
        pages: result.pages.map(({ requestedUrl, finalUrl, status, etag, lastModified, htmlSha256, catalogFingerprint, itemCount, error }) => ({
          requestedUrl,
          finalUrl,
          status,
          etag,
          lastModified,
          htmlSha256,
          catalogFingerprint,
          itemCount,
          error,
        })),
        items: result.items,
      };
    }
    const state = {
      schema: 'dp_external_content_index_state_v1',
      updatedAt: new Date().toISOString(),
      signalIds: [...new Set([...(previousState.signalIds || []), ...currentSignalIds])].sort(),
      sources: mergedSources,
    };
    await mkdir(path.dirname(options.state), { recursive: true });
    await writeFile(options.state, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  process.stdout.write(`${JSON.stringify({
    report: options.report,
    stateWritten: options.writeState ? options.state : null,
    confirmedSignals: confirmedSignals.length,
    candidateSignals: candidateSignals.length,
    sources: Object.fromEntries(Object.entries(results).map(([source, result]) => [source, {
      items: result.items.length,
      newItems: result.delta.newItems.length,
      removedItems: result.delta.removedItems.length,
    }])),
  }, null, 2)}\n`);
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    process.stderr.write(`\n[${label}] ${command} ${args.join(' ')}\n`);
    const child = spawn(command, args, { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

async function importAuthorized(options) {
  if (!options.importManifest) throw new Error('--import-manifest is required for import-authorized mode.');
  if (!options.confirmProduction) {
    throw new Error('Production import requires --confirm-production.');
  }
  const manifest = await readJsonIfExists(options.importManifest, null);
  if (!manifest || typeof manifest !== 'object') throw new Error('Import manifest must be a JSON object.');

  const results = [];
  for (const [source, input] of Object.entries(manifest)) {
    const importer = IMPORTERS[source];
    if (!importer) {
      results.push({ source, status: 'skipped', reason: 'No supported production importer.' });
      continue;
    }
    if (typeof input !== 'string' || !input.trim()) {
      results.push({ source, status: 'skipped', reason: 'Missing authorised local capture path.' });
      continue;
    }

    const common = [importer.script, importer.inputFlag, input];
    await runCommand(importer.command, [...common, '--mode', 'audit'], `${source}:audit`);
    await runCommand(importer.command, [...common, '--mode', 'dry-run'], `${source}:dry-run`);
    await runCommand(importer.command, [...common, '--mode', 'all', '--confirm-production'], `${source}:all`);
    await runCommand(importer.command, [...common, '--mode', 'verify'], `${source}:verify`);
    results.push({ source, status: 'imported-and-verified', input });
  }

  process.stdout.write(`${JSON.stringify({ mode: 'import-authorized', results }, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (options.mode === 'scan') await scan(options);
  else await importAuthorized(options);
}

main().catch((error) => {
  process.stderr.write(`External-content indexer failed: ${error.message || error}\n`);
  process.exitCode = 1;
});

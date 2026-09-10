#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, mkdir, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { htmlToPlainText } from './html-utils.mjs';

export const VILLAGE_INDEXER_VERSION = '1.0.0';
export const DEFAULT_VILLAGE_APP_URL = 'https://village.pirateib.su/';
const DEFAULT_REQUEST_CONCURRENCY = 6;
const DEFAULT_MAX_JSON_BYTES = 96 * 1024 * 1024;
const DEFAULT_MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_SCRIPT_DISCOVERY = 60;
const ALLOWED_HOST_SUFFIXES = ['.pirateib.su', '.pirateib.sh'];

const nowIso = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function defaultOutput() {
  return path.join(homedir(), 'Desktop', `VILLAGE-index-${timestamp()}`);
}

function usage() {
  return `PirateIB Village metadata/fingerprint indexer v${VILLAGE_INDEXER_VERSION}

Usage:
  node scripts/question-bank/capture-village.mjs [options]

Options:
  --output PATH             Output directory (default: ~/Desktop/VILLAGE-index-<timestamp>)
  --app-url URL             Village app URL (default: ${DEFAULT_VILLAGE_APP_URL})
  --candidate-base URL      Additional HTTPS base URL for discovered JSON filenames; repeatable
  --concurrency N           Concurrent source/JSON requests (default: ${DEFAULT_REQUEST_CONCURRENCY})
  --max-json-mb N           Maximum bytes accepted for one JSON source (default: ${DEFAULT_MAX_JSON_BYTES / 1024 / 1024})
  --fixture-dir PATH        Offline fixture mode; reads app-index.html, scripts/*.js and json/*.json
  --compare-production      Read-only comparison with production Revision Village source IDs
  --no-compare-production   Disable automatic comparison even when Supabase credentials exist
  --open                    Open the output folder on macOS when complete
  --help                    Show this help

Environment for read-only production comparison:
  NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY

The indexer does not persist source question text, markschemes or media. It emits
source IDs, taxonomy metadata, lengths and SHA-256 fingerprints only.
`;
}

function parsePositiveInt(value, label, maximum = 256) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = {
    output: defaultOutput(),
    appUrl: DEFAULT_VILLAGE_APP_URL,
    candidateBases: [],
    concurrency: DEFAULT_REQUEST_CONCURRENCY,
    maxJsonBytes: DEFAULT_MAX_JSON_BYTES,
    fixtureDir: null,
    compareProduction: null,
    open: false,
    help: false,
  };

  const take = (index, label) => {
    const value = argv[index + 1];
    if (!value) throw new Error(`${label} requires a value.`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = take(index++, '--output');
    else if (arg.startsWith('--output=')) options.output = arg.slice(9);
    else if (arg === '--app-url') options.appUrl = take(index++, '--app-url');
    else if (arg.startsWith('--app-url=')) options.appUrl = arg.slice(10);
    else if (arg === '--candidate-base') options.candidateBases.push(take(index++, '--candidate-base'));
    else if (arg.startsWith('--candidate-base=')) options.candidateBases.push(arg.slice(17));
    else if (arg === '--concurrency') options.concurrency = parsePositiveInt(take(index++, '--concurrency'), '--concurrency', 32);
    else if (arg.startsWith('--concurrency=')) options.concurrency = parsePositiveInt(arg.slice(14), '--concurrency', 32);
    else if (arg === '--max-json-mb') options.maxJsonBytes = parsePositiveInt(take(index++, '--max-json-mb'), '--max-json-mb', 1024) * 1024 * 1024;
    else if (arg.startsWith('--max-json-mb=')) options.maxJsonBytes = parsePositiveInt(arg.slice(14), '--max-json-mb', 1024) * 1024 * 1024;
    else if (arg === '--fixture-dir') options.fixtureDir = path.resolve(take(index++, '--fixture-dir'));
    else if (arg.startsWith('--fixture-dir=')) options.fixtureDir = path.resolve(arg.slice(14));
    else if (arg === '--compare-production') options.compareProduction = true;
    else if (arg === '--no-compare-production') options.compareProduction = false;
    else if (arg === '--open') options.open = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  const app = new URL(options.appUrl);
  if (app.protocol !== 'https:') throw new Error('--app-url must use HTTPS.');
  options.appUrl = app.href;
  options.output = path.resolve(options.output);
  options.candidateBases = options.candidateBases.map((value) => {
    const url = new URL(value, options.appUrl);
    if (url.protocol !== 'https:') throw new Error('--candidate-base must use HTTPS.');
    return url.href;
  });
  return options;
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

function isAllowedHost(hostname, appHostname) {
  const normalized = String(hostname || '').toLowerCase();
  if (normalized === appHostname.toLowerCase()) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function normalizeAllowedUrl(reference, baseUrl, appUrl = DEFAULT_VILLAGE_APP_URL) {
  try {
    const url = new URL(reference, baseUrl);
    const app = new URL(appUrl);
    if (url.protocol !== 'https:' || !isAllowedHost(url.hostname, app.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, run));
  return results;
}

async function fetchText(url, { maxBytes, label, appUrl = DEFAULT_VILLAGE_APP_URL }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/javascript,application/json,text/plain;q=0.9,*/*;q=0.2',
        'user-agent': `DP-Resources-Village-Indexer/${VILLAGE_INDEXER_VERSION}`,
      },
    });
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status} ${response.statusText}`);
    const finalUrl = normalizeAllowedUrl(response.url || url, url, appUrl);
    if (!finalUrl) throw new Error(`${label}: redirect left the allowed Village/PirateIB hosts.`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error(`${label}: declared size ${declared} exceeds ${maxBytes} bytes`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`${label}: response size ${bytes.length} exceeds ${maxBytes} bytes`);
    return {
      url: finalUrl,
      text: bytes.toString('utf8'),
      bytes: bytes.length,
      contentType: response.headers.get('content-type'),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      sha256: sha256(bytes),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function quotedStrings(source) {
  const values = [];
  const pattern = /(["'`])([^\n\r"'`]{1,1000})\1/g;
  for (const match of String(source || '').matchAll(pattern)) values.push(match[2]);
  return values;
}

export function discoverScriptReferences(source, baseUrl, appUrl = DEFAULT_VILLAGE_APP_URL) {
  const discovered = new Set();
  const htmlPattern = /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+\.(?:m?js)(?:\?[^"']*)?)["']/gi;
  for (const match of String(source || '').matchAll(htmlPattern)) {
    const url = normalizeAllowedUrl(match[1], baseUrl, appUrl);
    if (url) discovered.add(url);
  }
  for (const value of quotedStrings(source)) {
    if (!/\.m?js(?:[?#].*)?$/i.test(value)) continue;
    const url = normalizeAllowedUrl(value, baseUrl, appUrl);
    if (url) discovered.add(url);
  }
  return [...discovered].sort();
}

function looksLikeJsonReference(value) {
  return /(?:^|[/\\])[^?#"']+\.(?:json|ndjson)(?:[?#].*)?$/i.test(value.trim());
}

function looksLikeRelativeBase(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.includes('${') || looksLikeJsonReference(trimmed)) return false;
  return /^(?:https:\/\/|\/|\.\.?\/)[^?#]*\/$/i.test(trimmed);
}

function explicitAllowedBases(source, baseUrl, appUrl) {
  const bases = new Set([new URL('.', appUrl).href, new URL('.', baseUrl).href]);
  for (const value of quotedStrings(source)) {
    if (!looksLikeRelativeBase(value)) continue;
    const normalized = normalizeAllowedUrl(value, baseUrl, appUrl);
    if (!normalized) continue;
    bases.add(normalized.endsWith('/') ? normalized : new URL('.', normalized).href);
  }
  return [...bases];
}

export function discoverJsonReferences(source, baseUrl, appUrl = DEFAULT_VILLAGE_APP_URL, candidateBases = []) {
  const discovered = new Set();
  const bases = new Set([...explicitAllowedBases(source, baseUrl, appUrl), ...candidateBases]);

  for (const value of quotedStrings(source)) {
    if (!looksLikeJsonReference(value)) continue;
    const direct = normalizeAllowedUrl(value, baseUrl, appUrl);
    if (direct) discovered.add(direct);

    if (!/[/:]/.test(value)) {
      for (const base of bases) {
        const combined = normalizeAllowedUrl(value, base, appUrl);
        if (combined) discovered.add(combined);
      }
    }
  }

  const fileNameMap = String(source || '').match(/(?:const|let|var)\s+fileNameMap\s*=\s*\{([\s\S]*?)\}\s*;/);
  if (fileNameMap) {
    for (const match of fileNameMap[1].matchAll(/["'][^"']+["']\s*:\s*["']([^"']+\.(?:json|ndjson))["']/gi)) {
      const filename = match[1];
      for (const base of bases) {
        const combined = normalizeAllowedUrl(filename, base, appUrl);
        if (combined) discovered.add(combined);
      }
    }
  }

  return [...discovered].sort();
}

function normalizedKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function valueByKeys(record, keys) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
  const wanted = new Set(keys.map(normalizedKey));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizedKey(key))) return value;
  }
  return undefined;
}

function cleanArray(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => typeof item === 'string' ? item.split(/\s*[|;]\s*/) : [item])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function plainText(value) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return htmlToPlainText(text, { imagePlaceholder: '[image]', preserveBlockBreaks: true })
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceQuestionId(record, normalizedQuestion) {
  const direct = valueByKeys(record, ['question_id', 'questionId', 'source_question_id', 'sourceQuestionId', 'uuid', 'id']);
  if (direct != null && String(direct).trim()) return String(direct).trim();
  return normalizedQuestion ? `hash:${sha256(normalizedQuestion.toLowerCase())}` : null;
}

function questionPayload(record) {
  return valueByKeys(record, ['Question', 'question', 'question_html', 'questionHtml', 'prompt', 'stem', 'content', 'body']);
}

function markschemePayload(record) {
  return valueByKeys(record, ['Markscheme', 'markscheme', 'mark_scheme', 'markScheme', 'solution', 'answer', 'explanation']);
}

export function isQuestionLike(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const question = questionPayload(record);
  const markscheme = markschemePayload(record);
  const id = valueByKeys(record, ['question_id', 'questionId', 'source_question_id', 'sourceQuestionId', 'uuid', 'id']);
  const hasTaxonomy = valueByKeys(record, ['topics', 'topic', 'subtopics', 'subtopic', 'subject', 'course']) != null;
  const questionLength = plainText(question).length;
  const markschemeLength = plainText(markscheme).length;
  return Boolean(
    (id != null && (questionLength >= 8 || markschemeLength >= 8)) ||
    (questionLength >= 24 && (markschemeLength >= 4 || hasTaxonomy)),
  );
}

export function collectQuestionRecords(value, maxDepth = 10) {
  const records = [];
  const seen = new Set();

  function visit(current, depth) {
    if (current == null || depth > maxDepth) return;
    if (typeof current !== 'object') return;
    if (seen.has(current)) return;
    seen.add(current);

    if (isQuestionLike(current)) records.push(current);
    if (Array.isArray(current)) {
      for (const item of current) visit(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      if (/question|markscheme|solution|answer|explanation|content|prompt|stem|body/i.test(key) && typeof child === 'string') continue;
      visit(child, depth + 1);
    }
  }

  visit(value, 0);
  return records;
}

function scalar(value) {
  if (value == null || typeof value === 'object') return null;
  const text = String(value).trim();
  return text || null;
}

export function indexQuestionRecord(record, sourceUrl) {
  const questionRaw = questionPayload(record);
  const markschemeRaw = markschemePayload(record);
  const questionText = plainText(questionRaw);
  const markschemeText = plainText(markschemeRaw);
  const id = sourceQuestionId(record, questionText);
  if (!id) return null;

  const subject = scalar(valueByKeys(record, ['subject', 'subject_name', 'subjectName', 'subject_group', 'subjectGroup']));
  const course = scalar(valueByKeys(record, ['course', 'course_name', 'courseName', 'syllabus', 'bank']));
  const level = scalar(valueByKeys(record, ['level', 'tier']));
  const paper = scalar(valueByKeys(record, ['paper', 'paper_name', 'paperName']));
  const session = scalar(valueByKeys(record, ['session', 'exam_session', 'examSession']));
  const reference = scalar(valueByKeys(record, ['reference', 'ref', 'question_reference', 'questionReference']));
  const topics = cleanArray(valueByKeys(record, ['topics', 'topic']));
  const subtopics = cleanArray(valueByKeys(record, ['subtopics', 'subtopic']));
  const questionHash = sha256(questionText.toLowerCase());
  const markschemeHash = sha256(markschemeText.toLowerCase());

  return {
    source_question_id: id,
    source_url: sourceUrl,
    subject,
    course,
    level,
    paper,
    session,
    reference,
    topics,
    subtopics,
    question_length: questionText.length,
    markscheme_length: markschemeText.length,
    question_sha256: questionHash,
    markscheme_sha256: markschemeHash,
    combined_sha256: sha256(`${questionHash}\n${markschemeHash}`),
  };
}

function mergeIndexedQuestion(existing, incoming) {
  if (!existing) return { ...incoming, occurrences: 1, source_urls: [incoming.source_url] };
  existing.occurrences += 1;
  if (!existing.source_urls.includes(incoming.source_url)) existing.source_urls.push(incoming.source_url);
  for (const field of ['subject', 'course', 'level', 'paper', 'session', 'reference']) {
    if (!existing[field] && incoming[field]) existing[field] = incoming[field];
  }
  existing.topics = [...new Set([...existing.topics, ...incoming.topics])].sort();
  existing.subtopics = [...new Set([...existing.subtopics, ...incoming.subtopics])].sort();
  if (existing.combined_sha256 !== incoming.combined_sha256) {
    existing.conflicting_fingerprints = [...new Set([existing.combined_sha256, ...(existing.conflicting_fingerprints || []), incoming.combined_sha256])];
  }
  return existing;
}

async function writeNdjson(filename, rows) {
  await mkdir(path.dirname(filename), { recursive: true });
  const handle = await open(filename, 'w');
  try {
    for (const row of rows) await handle.write(`${JSON.stringify(row)}\n`);
  } finally {
    await handle.close();
  }
}

function sourceManifestEntry(result, kind) {
  return {
    kind,
    url: result.url,
    bytes: result.bytes,
    content_type: result.contentType,
    etag: result.etag,
    last_modified: result.lastModified,
    sha256: result.sha256,
  };
}

async function discoverLiveSources(options) {
  const sourceManifest = [];
  const app = await fetchText(options.appUrl, {
    maxBytes: DEFAULT_MAX_SCRIPT_BYTES,
    label: 'Village app',
    appUrl: options.appUrl,
  });
  sourceManifest.push(sourceManifestEntry(app, 'html'));

  const scriptQueue = discoverScriptReferences(app.text, app.url, options.appUrl);
  for (const fallback of ['./index.js', './app/index.js']) {
    const candidate = normalizeAllowedUrl(fallback, options.appUrl, options.appUrl);
    if (candidate && !scriptQueue.includes(candidate)) scriptQueue.push(candidate);
  }

  const scripts = [];
  const visited = new Set();
  while (scriptQueue.length && visited.size < MAX_SCRIPT_DISCOVERY) {
    const batch = [];
    while (scriptQueue.length && batch.length < options.concurrency) {
      const next = scriptQueue.shift();
      if (!visited.has(next)) {
        visited.add(next);
        batch.push(next);
      }
    }
    const results = await mapLimit(batch, options.concurrency, async (url) => fetchText(url, {
      maxBytes: DEFAULT_MAX_SCRIPT_BYTES,
      label: 'Village script',
      appUrl: options.appUrl,
    }));
    for (const result of results) {
      if (!result.ok) continue;
      scripts.push(result.value);
      sourceManifest.push(sourceManifestEntry(result.value, 'javascript'));
      for (const child of discoverScriptReferences(result.value.text, result.value.url, options.appUrl)) {
        if (!visited.has(child) && !scriptQueue.includes(child)) scriptQueue.push(child);
      }
    }
  }

  const candidateBases = [...new Set([new URL('.', options.appUrl).href, ...options.candidateBases])];
  const jsonCandidates = new Set(discoverJsonReferences(app.text, app.url, options.appUrl, candidateBases));
  for (const script of scripts) {
    for (const candidate of discoverJsonReferences(script.text, script.url, options.appUrl, candidateBases)) jsonCandidates.add(candidate);
  }

  return { sourceManifest, jsonCandidates: [...jsonCandidates].sort() };
}

async function discoverFixtureSources(options) {
  const htmlPath = path.join(options.fixtureDir, 'app-index.html');
  if (!await exists(htmlPath)) throw new Error('Fixture directory must contain app-index.html.');
  const html = await readFile(htmlPath, 'utf8');
  const sourceManifest = [{
    kind: 'html',
    url: options.appUrl,
    bytes: Buffer.byteLength(html),
    content_type: 'text/html',
    etag: null,
    last_modified: null,
    sha256: sha256(html),
  }];

  const scripts = [];
  const scriptDir = path.join(options.fixtureDir, 'scripts');
  if (await exists(scriptDir)) {
    for (const entry of await readdir(scriptDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.m?js$/i.test(entry.name)) continue;
      const text = await readFile(path.join(scriptDir, entry.name), 'utf8');
      const url = new URL(`./${entry.name}`, options.appUrl).href;
      scripts.push({ text, url });
      sourceManifest.push({
        kind: 'javascript', url, bytes: Buffer.byteLength(text), content_type: 'application/javascript',
        etag: null, last_modified: null, sha256: sha256(text),
      });
    }
  }

  const jsonDir = path.join(options.fixtureDir, 'json');
  const fixtureJson = [];
  if (await exists(jsonDir)) {
    for (const entry of await readdir(jsonDir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(?:json|ndjson)$/i.test(entry.name)) fixtureJson.push(path.join(jsonDir, entry.name));
    }
  }

  const candidateBases = [...new Set([new URL('.', options.appUrl).href, ...options.candidateBases])];
  const jsonCandidates = new Set(discoverJsonReferences(html, options.appUrl, options.appUrl, candidateBases));
  for (const script of scripts) {
    for (const candidate of discoverJsonReferences(script.text, script.url, options.appUrl, candidateBases)) jsonCandidates.add(candidate);
  }
  return { sourceManifest, jsonCandidates: [...jsonCandidates].sort(), fixtureJson };
}

async function readFixtureJson(filename) {
  const text = await readFile(filename, 'utf8');
  return {
    url: `fixture://${path.basename(filename)}`,
    text,
    bytes: Buffer.byteLength(text),
    contentType: 'application/json',
    etag: null,
    lastModified: null,
    sha256: sha256(text),
  };
}

function parseJsonText(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty JSON source.');
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return JSON.parse(trimmed);
  const rows = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

async function indexJsonSources(discovery, options) {
  const sourceSummaries = [];
  const failures = [];
  const byId = new Map();

  const inputs = options.fixtureDir
    ? discovery.fixtureJson.map((filename) => ({ fixture: filename }))
    : discovery.jsonCandidates.map((url) => ({ url }));

  const results = await mapLimit(inputs, options.concurrency, async (input) => {
    const response = input.fixture
      ? await readFixtureJson(input.fixture)
      : await fetchText(input.url, {
          maxBytes: options.maxJsonBytes,
          label: 'Village JSON source',
          appUrl: options.appUrl,
        });
    const parsed = parseJsonText(response.text);
    const records = collectQuestionRecords(parsed);
    const indexed = records.map((record) => indexQuestionRecord(record, response.url)).filter(Boolean);
    return { response, indexed, recordsFound: records.length };
  });

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const input = inputs[index];
    if (!result.ok) {
      failures.push({ source: input.url || input.fixture, error: result.error.message });
      continue;
    }
    const { response, indexed, recordsFound } = result.value;
    sourceSummaries.push({
      url: response.url,
      bytes: response.bytes,
      content_type: response.contentType,
      etag: response.etag,
      last_modified: response.lastModified,
      sha256: response.sha256,
      question_records_found: recordsFound,
      unique_source_question_ids: new Set(indexed.map((row) => row.source_question_id)).size,
    });
    for (const row of indexed) byId.set(row.source_question_id, mergeIndexedQuestion(byId.get(row.source_question_id), row));
  }

  return {
    rows: [...byId.values()].sort((a, b) => a.source_question_id.localeCompare(b.source_question_id)),
    sourceSummaries,
    failures,
  };
}

async function fetchProductionRevisionVillageIds() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;

  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('dp_qb_question_sources')
      .select('source_question_id')
      .eq('provider', 'revision_village')
      .neq('review_status', 'rejected')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Production comparison failed: ${error.message}`);
    for (const row of data || []) {
      if (row.source_question_id) ids.add(String(row.source_question_id));
    }
    if (!data || data.length < pageSize) break;
  }
  return ids;
}

export function compareSourceIds(villageIdsInput, productionIdsInput) {
  const villageIds = new Set(villageIdsInput);
  const productionIds = new Set(productionIdsInput);
  const present = [...villageIds].filter((id) => productionIds.has(id)).sort();
  const newIds = [...villageIds].filter((id) => !productionIds.has(id)).sort();
  const missingIds = [...productionIds].filter((id) => !villageIds.has(id)).sort();
  return {
    village_source_question_ids: villageIds.size,
    production_revision_village_source_question_ids: productionIds.size,
    present_in_both: present.length,
    new_in_village: newIds.length,
    production_ids_not_seen_in_village: missingIds.length,
    present_source_question_ids: present,
    new_source_question_ids: newIds,
    production_ids_not_seen: missingIds,
  };
}

async function writeChecksums(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name !== 'checksums.sha256' && !entry.name.endsWith('.zip')) files.push(full);
    }
  }
  await walk(root);
  const lines = [];
  for (const file of files.sort()) {
    const bytes = await readFile(file);
    lines.push(`${sha256(bytes)}  ${path.relative(root, file).split(path.sep).join('/')}`);
  }
  await writeFile(path.join(root, 'checksums.sha256'), `${lines.join('\n')}\n`);
}

async function createAuditBundle(root) {
  const destination = path.join(root, `VILLAGE-audit-bundle-${timestamp()}.zip`);
  return new Promise((resolve) => {
    const child = spawn('zip', ['-r', '-9', destination, 'summary.json', 'checksums.sha256', 'source', 'index', 'comparison'], {
      cwd: root,
      stdio: 'ignore',
    });
    child.once('error', () => resolve(null));
    child.once('exit', (code) => resolve(code === 0 ? destination : null));
  });
}

async function openOutput(root) {
  if (process.platform !== 'darwin') return;
  const child = spawn('open', [root], { detached: true, stdio: 'ignore' });
  child.unref();
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  await mkdir(options.output, { recursive: true });
  await mkdir(path.join(options.output, 'source'), { recursive: true });
  await mkdir(path.join(options.output, 'index'), { recursive: true });
  await mkdir(path.join(options.output, 'comparison'), { recursive: true });
  const startedAt = nowIso();

  console.log(`\nPirateIB Village metadata/fingerprint indexer v${VILLAGE_INDEXER_VERSION}`);
  console.log(`App: ${options.appUrl}`);
  console.log(`Output: ${options.output}`);
  console.log('No source question text, markschemes or media will be written to disk.');

  const discovery = options.fixtureDir ? await discoverFixtureSources(options) : await discoverLiveSources(options);
  await writeFile(path.join(options.output, 'source', 'source-manifest.json'), json(discovery.sourceManifest));
  await writeFile(path.join(options.output, 'source', 'json-candidates.json'), json(discovery.jsonCandidates));

  console.log(`Discovered ${discovery.sourceManifest.length} app/source files and ${discovery.jsonCandidates.length} candidate JSON endpoints.`);
  const indexed = await indexJsonSources(discovery, options);
  await writeNdjson(path.join(options.output, 'index', 'questions.ndjson'), indexed.rows);
  await writeFile(path.join(options.output, 'index', 'source-summary.json'), json(indexed.sourceSummaries));
  await writeFile(path.join(options.output, 'index', 'failures.json'), json(indexed.failures));

  const shouldCompare = options.compareProduction ?? Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  let comparison = null;
  if (shouldCompare) {
    const productionIds = await fetchProductionRevisionVillageIds();
    if (!productionIds) throw new Error('Production comparison requested but Supabase credentials are missing.');
    comparison = compareSourceIds(indexed.rows.map((row) => row.source_question_id), productionIds);
    await writeFile(path.join(options.output, 'comparison', 'production-source-id-comparison.json'), json(comparison));
  }

  const conflictingFingerprintIds = indexed.rows.filter((row) => row.conflicting_fingerprints?.length).map((row) => row.source_question_id);
  const summary = {
    format: 'dp-resources-pirateib-village-index-v1',
    indexer_version: VILLAGE_INDEXER_VERSION,
    started_at: startedAt,
    completed_at: nowIso(),
    app_url: options.appUrl,
    capture_policy: 'metadata-and-content-fingerprints-only',
    source_files_observed: discovery.sourceManifest.length,
    candidate_json_endpoints: discovery.jsonCandidates.length,
    parsed_json_sources: indexed.sourceSummaries.length,
    failed_json_sources: indexed.failures.length,
    unique_source_question_ids: indexed.rows.length,
    conflicting_source_id_fingerprints: conflictingFingerprintIds.length,
    conflicting_source_question_ids: conflictingFingerprintIds,
    production_comparison: comparison ? {
      production_revision_village_source_question_ids: comparison.production_revision_village_source_question_ids,
      present_in_both: comparison.present_in_both,
      new_in_village: comparison.new_in_village,
      production_ids_not_seen_in_village: comparison.production_ids_not_seen_in_village,
    } : null,
    fixture_mode: Boolean(options.fixtureDir),
  };
  await writeFile(path.join(options.output, 'summary.json'), json(summary));
  await writeChecksums(options.output);
  const bundle = await createAuditBundle(options.output);
  if (bundle) console.log(`Audit bundle: ${bundle}`);
  if (options.open) await openOutput(options.output);

  console.log('\nVillage indexing complete.');
  console.log(json(summary));
  if (indexed.failures.length) process.exitCode = 2;
}

async function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const [modulePath, invokedPath] = await Promise.all([
      realpath(fileURLToPath(import.meta.url)),
      realpath(path.resolve(process.argv[1])),
    ]);
    return modulePath === invokedPath;
  } catch {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  }
}

if (await isMainModule()) {
  main().catch((error) => {
    console.error(`\nFatal error: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
